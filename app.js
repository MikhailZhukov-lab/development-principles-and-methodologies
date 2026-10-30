(() => {
  'use strict';

  const core = window.ApproxMath;
  const palette = { ink: '#202620', muted: '#8b9088', grid: '#e9e6df', orange: '#dc7248', green: '#1f6f58', blue: '#5277b7', white: '#fffefa' };
  const state = { size: 5, customPoints: null, method: 'all', degree: 2, progress: 1, playing: false, started: 0, elapsed: 0, duration: 1500, frame: 0, data: [], lagrange: null, fit: null, curve: [] };
  const chart = document.querySelector('#chart');
  const residualCanvas = document.querySelector('#residuals');
  const chartCtx = chart.getContext('2d');
  const residualCtx = residualCanvas.getContext('2d');
  const pointsField = document.querySelector('#customPoints');
  const inputMessage = document.querySelector('#inputMessage');

  function formatNumber(value) { return Number(value.toPrecision(12)).toString(); }
  function formatPoints(points) {
    return points.map((point, index) => `${index + 1}) [${formatNumber(point.x)}; ${formatNumber(point.y)}]${index < points.length - 1 ? ',' : ''}`).join('\n');
  }
  function setInputMessage(text, isError = false) {
    inputMessage.textContent = text;
    inputMessage.classList.toggle('error', isError);
  }

  const pointsForSize = size => core.pointsForSize(size);
  const lagrange = (points, x) => core.lagrange(points, x);
  const leastSquares = (points, degree) => core.leastSquares(points, degree);
  const metrics = (fn, points) => core.metrics(fn, points);

  function setupCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  function niceStep(span) {
    const raw = span / 5 || 1;
    const power = 10 ** Math.floor(Math.log10(Math.abs(raw)));
    const fraction = raw / power;
    return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power;
  }

  function range(values, padding = 0.12) {
    let min = Math.min(...values), max = Math.max(...values);
    if (Math.abs(max - min) < 1e-12 * Math.max(1, Math.abs(max), Math.abs(min))) {
      const pad = Math.max(1, Math.abs(max) * 0.1); min -= pad; max += pad;
    } else {
      const pad = (max - min) * padding; min -= pad; max += pad;
    }
    return [min, max];
  }

  function drawAxes(ctx, box, xRange, yRange) {
    const { width, height } = box;
    const plot = { left: 48, right: width - 13, top: 13, bottom: height - 33 };
    plot.w = plot.right - plot.left; plot.h = plot.bottom - plot.top;
    const X = x => plot.left + (x - xRange[0]) / (xRange[1] - xRange[0]) * plot.w;
    const Y = y => plot.bottom - (y - yRange[0]) / (yRange[1] - yRange[0]) * plot.h;
    const xStep = niceStep(xRange[1] - xRange[0]), yStep = niceStep(yRange[1] - yRange[0]);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10px DM Mono, monospace'; ctx.lineWidth = 1;
    for (let x = Math.ceil(xRange[0] / xStep) * xStep; x <= xRange[1] + xStep * 0.01; x += xStep) {
      const px = X(x); ctx.strokeStyle = palette.grid; ctx.beginPath(); ctx.moveTo(px, plot.top); ctx.lineTo(px, plot.bottom); ctx.stroke();
      ctx.fillStyle = palette.muted; ctx.textAlign = 'center'; ctx.fillText(Number(x.toPrecision(3)), px, height - 12);
    }
    for (let y = Math.ceil(yRange[0] / yStep) * yStep; y <= yRange[1] + yStep * 0.01; y += yStep) {
      const py = Y(y); ctx.strokeStyle = palette.grid; ctx.beginPath(); ctx.moveTo(plot.left, py); ctx.lineTo(plot.right, py); ctx.stroke();
      ctx.fillStyle = palette.muted; ctx.textAlign = 'right'; ctx.fillText(Number(y.toPrecision(3)), plot.left - 8, py + 3);
    }
    ctx.fillStyle = '#858a82'; ctx.textAlign = 'center'; ctx.fillText('x', plot.left + plot.w / 2, height - 1);
    ctx.save(); ctx.translate(12, plot.top + plot.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('y', 0, 0); ctx.restore();
    return { plot, X, Y };
  }

  function drawCurve(ctx, points, mapper, color, progress, width = 2) {
    const limit = Math.max(2, Math.floor(points.length * progress));
    ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 0; i < limit; i++) {
      const p = points[i]; const x = mapper.X(p.x), y = mapper.Y(p.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawMain() {
    const box = setupCanvas(chart, chartCtx);
    if (!box.width) return;
    const xMin = state.data[0].x, xMax = state.data.at(-1).x;
    const visibleSeries = [];
    if (state.method !== 'leastSquares') visibleSeries.push({ fn: state.lagrange, color: palette.orange });
    if (state.method !== 'lagrange') visibleSeries.push({ fn: state.fit, color: palette.green });
    visibleSeries.push({ fn: Math.exp, color: palette.blue, exact: true });
    const curveN = 260;
    const sampled = visibleSeries.map(s => Array.from({ length: curveN }, (_, i) => {
      const x = xMin + (xMax - xMin) * i / (curveN - 1);
      const raw = s.fn(x); return { x, y: Number.isFinite(raw) ? raw : NaN };
    }));
    const allY = [...state.data.map(p => p.y)];
    sampled.forEach(line => line.forEach(p => { if (Number.isFinite(p.y)) allY.push(p.y); }));
    const xRange = range([xMin, xMax], 0.04), yRange = range(allY, 0.1);
    const mapper = drawAxes(chartCtx, box, xRange, yRange);
    sampled.forEach((line, i) => drawCurve(chartCtx, line.filter(p => Number.isFinite(p.y)), mapper, visibleSeries[i].color, state.progress, visibleSeries[i].exact ? 1.5 : 2.2));
    const visibleCount = Math.max(1, Math.ceil(state.data.length * state.progress));
    state.data.slice(0, visibleCount).forEach((p, i) => {
      chartCtx.beginPath(); chartCtx.arc(mapper.X(p.x), mapper.Y(p.y), i === visibleCount - 1 && state.progress < 1 ? 5.5 : 3.8, 0, Math.PI * 2);
      chartCtx.fillStyle = i === visibleCount - 1 && state.progress < 1 ? palette.orange : palette.ink; chartCtx.fill();
      chartCtx.strokeStyle = palette.white; chartCtx.lineWidth = 1.5; chartCtx.stroke();
    });
    state.curve = sampled;
  }

  function drawResiduals() {
    const box = setupCanvas(residualCanvas, residualCtx);
    if (!box.width) return;
    const stat = metrics(state.fit, state.data);
    const xRange = range(state.data.map(p => p.x), 0.08);
    const values = [...stat.residuals, 0];
    const yRange = range(values, 0.25);
    const mapper = drawAxes(residualCtx, box, xRange, yRange);
    if (yRange[0] < 0 && yRange[1] > 0) {
      residualCtx.save(); residualCtx.setLineDash([4, 4]); residualCtx.strokeStyle = '#a8aba3'; residualCtx.beginPath(); residualCtx.moveTo(mapper.plot.left, mapper.Y(0)); residualCtx.lineTo(mapper.plot.right, mapper.Y(0)); residualCtx.stroke(); residualCtx.restore();
    }
    const count = Math.max(1, Math.ceil(state.data.length * state.progress));
    for (let i = 0; i < count; i++) {
      const p = state.data[i], residual = stat.residuals[i];
      residualCtx.strokeStyle = palette.orange; residualCtx.lineWidth = 2; residualCtx.beginPath(); residualCtx.moveTo(mapper.X(p.x), mapper.Y(0)); residualCtx.lineTo(mapper.X(p.x), mapper.Y(residual)); residualCtx.stroke();
      residualCtx.fillStyle = palette.ink; residualCtx.beginPath(); residualCtx.arc(mapper.X(p.x), mapper.Y(residual), 3.2, 0, Math.PI * 2); residualCtx.fill();
    }
  }

  function renderMetrics() {
    const rows = [5, 10, 20].map(size => {
      const points = core.pointsForSize(size);
      const lagrangeFn = x => lagrange(points, x);
      const fit = leastSquares(points, Math.min(state.degree, points.length - 1));
      const lagrangeValues = Array.from({ length: 260 }, (_, i) => lagrangeFn(points[0].x + (points.at(-1).x - points[0].x) * i / 259));
      return {
        label: size === 10 ? '10 (аркуш)' : String(size),
        n: points.length,
        lagrangeDegree: points.length - 1,
        lagrangeMin: Math.min(...lagrangeValues),
        lagrangeMax: Math.max(...lagrangeValues),
        lagrangeLoo: core.leaveOneOutRMSE(points, 'lagrange'),
        degree: Math.min(state.degree, points.length - 1),
        ...metrics(fit, points),
        loo: core.leaveOneOutRMSE(points, 'leastSquares', Math.min(state.degree, points.length - 1))
      };
    });
    document.querySelector('#metrics').innerHTML = rows.map(row => `<tr><td>${row.label}</td><td>${row.n}</td><td>${row.lagrangeDegree}</td><td>${format(row.lagrangeMin)} … ${format(row.lagrangeMax)}</td><td>${format(row.lagrangeLoo)}</td><td>${row.degree}</td><td>${format(row.rss)}</td><td>${format(row.r2)}</td><td>${format(row.loo)}</td></tr>`).join('');
  }

  function polynomialText(coefficients, degree) {
    const terms = [];
    for (let power = 0; power <= degree; power++) {
      const coefficient = coefficients[power] || 0;
      if (Math.abs(coefficient) < 1e-10) continue;
      const abs = Number(Math.abs(coefficient).toPrecision(4)).toLocaleString('uk-UA');
      const variable = power === 0 ? '' : power === 1 ? '·x' : `·x^${power}`;
      terms.push({ sign: coefficient < 0 ? '−' : '+', text: `${abs}${variable}` });
    }
    if (!terms.length) return 'P(x) = 0';
    return `P${degree}(x) = ${terms[0].sign === '−' ? '−' : ''}${terms[0].text}` + terms.slice(1).map(term => ` ${term.sign} ${term.text}`).join(' ');
  }

  function renderDetails() {
    const fitStats = metrics(state.fit, state.data);
    const maxResidual = Math.max(...fitStats.residuals.map(Math.abs));
    const condition = core.conditionNumber(state.data, state.degree, true);
    document.querySelector('#fitFormula').textContent = polynomialText(state.fit.coefficients, state.degree);
    document.querySelector('#fitMetrics').innerHTML = [
      ['RSS (сума квадратів)', fitStats.rss],
      ['RMSE', fitStats.rmse],
      ['R²', fitStats.r2],
      ['max |e|', maxResidual],
      ['cond(A), x нормалізовано', condition]
    ].map(([label, value]) => `<dt>${label}</dt><dd>${format(value)}</dd>`).join('');

    const lagrangeValues = Array.from({ length: 260 }, (_, i) => lagrange(state.data,
      state.data[0].x + (state.data.at(-1).x - state.data[0].x) * i / 259));
    document.querySelector('#lagrangeDetails').innerHTML = [
      ['Кількість вузлів n', state.data.length],
      ['Степінь полінома', state.data.length - 1],
      ['min / max L(x)', `${format(Math.min(...lagrangeValues))} … ${format(Math.max(...lagrangeValues))}`],
      ['Екстраполяційні вузли', '0 (у межах вузлів)']
    ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
    const newton = core.dividedDifferences(state.data);
    document.querySelector('#newtonCoefficients').innerHTML = newton.map((value, index) => `<span class="coefficient-chip">a${index} = ${format(value)}</span>`).join('');
    document.querySelector('#pointDetails').innerHTML = state.data.map((point, index) => {
      const predicted = state.fit(point.x), residual = point.y - predicted;
      return `<tr><td>${index + 1}</td><td>${format(point.x)}</td><td>${format(point.y)}</td><td>${format(predicted)}</td><td class="${residual >= 0 ? 'residual-positive' : 'residual-negative'}">${format(residual)}</td></tr>`;
    }).join('');
  }

  function drawMiniCharts() {
    const holder = document.querySelector('#miniCharts');
    if (!holder.children.length) {
      for (const size of [5, 10, 20]) {
        for (const method of ['lagrange', 'leastSquares']) {
          const card = document.createElement('article');
          card.className = 'mini-card';
          const actualCount = core.pointsForSize(size).length;
          const label = actualCount === size ? `${size} ВУЗЛІВ` : `НАБІР ${size} · ${actualCount} ВУЗЛІВ З ФАЙЛУ`;
          card.dataset.size = String(size);
          card.innerHTML = `<div class="mini-title"><span>${method === 'lagrange' ? 'Лагранж' : 'МНК'}</span><small>${label}</small></div><canvas aria-label="Графік ${method === 'lagrange' ? 'Лагранжа' : 'МНК'} для набору ${size}"></canvas>`;
          holder.append(card);
        }
      }
    }
    Array.from(holder.querySelectorAll('canvas')).forEach(canvas => {
      const card = canvas.closest('.mini-card');
      const size = Number(card.dataset.size);
      const methodName = card.querySelector('.mini-title span').textContent;
      const points = core.pointsForSize(size);
      const fn = methodName === 'Лагранж' ? x => lagrange(points, x) : leastSquares(points, Math.min(state.degree, size - 1));
      const ctx = canvas.getContext('2d'), box = setupCanvas(canvas, ctx);
      if (!box.width) return;
      const line = Array.from({ length: 120 }, (_, i) => {
        const x = points[0].x + (points.at(-1).x - points[0].x) * i / 119;
        return { x, y: fn(x) };
      }).filter(p => Number.isFinite(p.y));
      const xRange = range([points[0].x, points.at(-1).x], 0.05);
      const yRange = range([...points.map(p => p.y), ...line.map(p => p.y)], 0.1);
      const mapper = drawAxes(ctx, box, xRange, yRange);
      drawCurve(ctx, line, mapper, methodName === 'Лагранж' ? palette.orange : palette.green, 1, 2);
      points.forEach(p => { ctx.beginPath(); ctx.arc(mapper.X(p.x), mapper.Y(p.y), 2.8, 0, Math.PI * 2); ctx.fillStyle = palette.ink; ctx.fill(); });
    });
  }

  function format(value) { return Number.isFinite(value) ? value.toLocaleString('uk-UA', { maximumFractionDigits: 5 }) : '—'; }
  function compute() {
    state.data = state.customPoints || pointsForSize(state.size);
    state.lagrange = x => lagrange(state.data, x);
    state.degree = Math.min(state.degree, state.data.length - 1);
    state.fit = leastSquares(state.data, state.degree);
    document.querySelector('#degree').max = Math.min(4, state.size - 1);
    document.querySelector('#degree').value = state.degree;
    document.querySelector('#degreeValue').textContent = state.degree;
    document.querySelector('#pointCount').textContent = state.customPoints ? 'Власний режим' : `${state.size} точок`;
    document.querySelector('#datasetTitle').textContent = state.customPoints
      ? 'ВЛАСНИЙ РЕЖИМ' : 'РЕЖИМ ВАРІАНТА 2';
    document.querySelector('#datasetValue').textContent = state.customPoints
      ? 'Власний набір'
      : `Набір варіанта (${state.size} точок)`;
    document.querySelector('#residualStatus').textContent = `МНК, m = ${state.degree}`;
    document.querySelector('#chartStatus').textContent = 'Автомасштаб активний';
    renderMetrics(); renderDetails(); drawMain(); drawResiduals(); drawMiniCharts();
  }

  function animate(now) {
    if (!state.playing) return;
    const elapsed = state.elapsed + now - state.started;
    state.progress = Math.min(1, elapsed / state.duration);
    drawMain(); drawResiduals();
    if (state.progress >= 1) {
      state.playing = false;
      state.elapsed = state.duration;
      document.querySelector('#play').innerHTML = '<span>▶</span> Відтворити';
      document.querySelector('#chartStatus').textContent = 'Побудову завершено';
      return;
    }
    state.frame = requestAnimationFrame(animate);
  }

  document.querySelectorAll('.size-button').forEach(button => button.addEventListener('click', () => {
    state.customPoints = null;
    state.size = Number(button.dataset.size);
    pointsField.value = formatPoints(core.pointsForSize(state.size));
    document.querySelector('.custom-data').open = true;
    document.querySelectorAll('.size-button').forEach(item => item.classList.toggle('active', item === button));
    setInputMessage(`Режим: набір варіанта (${state.size} точок).`);
    stopAnimation(); state.elapsed = 0; state.progress = 1; compute();
  }));
  function applyFieldPoints(showSuccess = true) {
    try {
      const parsed = core.parsePoints(pointsField.value);
      state.customPoints = parsed;
      if (parsed.length !== core.pointsForSize(state.size).length) {
        document.querySelectorAll('.size-button').forEach(button => button.classList.remove('active'));
      }
      setInputMessage(showSuccess ? 'Власний режим застосовано.' : 'Графік оновлено.');
      stopAnimation(); state.elapsed = 0; state.progress = 1; compute();
      return true;
    } catch (error) {
      setInputMessage(error.message, true);
      return false;
    }
  }
  pointsField.addEventListener('input', () => applyFieldPoints(false));
  document.querySelector('#applyPoints').addEventListener('click', () => {
    applyFieldPoints(true);
  });
  document.querySelector('#presetPoints').addEventListener('click', () => {
    state.customPoints = null;
    pointsField.value = formatPoints(core.pointsForSize(state.size));
    document.querySelectorAll('.size-button').forEach(button => button.classList.toggle('active', Number(button.dataset.size) === state.size));
    setInputMessage(`Повернуто режим набору варіанта (${state.size} точок).`);
    stopAnimation(); state.elapsed = 0; state.progress = 1; compute();
  });
  document.querySelector('#method').addEventListener('change', event => { state.method = event.target.value; drawMain(); });
  document.querySelector('#degree').addEventListener('input', event => {
    state.degree = Number(event.target.value); state.progress = 1; compute();
  });
  document.querySelector('#play').addEventListener('click', () => {
    if (state.playing) {
      state.elapsed = state.progress * state.duration;
      stopAnimation();
      return;
    }
    if (state.progress >= 1) { state.progress = 0; state.elapsed = 0; }
    state.playing = true; state.started = performance.now();
    document.querySelector('#play').innerHTML = '<span>Ⅱ</span> Пауза';
    document.querySelector('#chartStatus').textContent = 'Вузли та криві додаються';
    state.frame = requestAnimationFrame(animate);
  });
  document.querySelector('#reset').addEventListener('click', () => { stopAnimation(); state.elapsed = 0; state.progress = 1; compute(); });
  function stopAnimation() {
    state.playing = false; cancelAnimationFrame(state.frame);
    document.querySelector('#play').innerHTML = '<span>▶</span> Відтворити';
  }

  function showHover(event) {
    const rect = chart.getBoundingClientRect();
    const xFraction = (event.clientX - rect.left - 48) / (rect.width - 61);
    const x = state.data[0].x + Math.max(0, Math.min(1, xFraction)) * (state.data.at(-1).x - state.data[0].x);
    const nearest = state.data.reduce((best, p) => Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best, state.data[0]);
    document.querySelector('#chartStatus').textContent = `x=${format(nearest.x)}, y=${format(nearest.y)}, e=${format(nearest.y - state.fit(nearest.x))}`;
  }
  chart.addEventListener('pointermove', showHover);
  chart.addEventListener('pointerleave', () => { document.querySelector('#chartStatus').textContent = 'Автомасштаб активний'; });
  window.addEventListener('resize', () => { drawMain(); drawResiduals(); drawMiniCharts(); });
  pointsField.value = formatPoints(core.pointsForSize(state.size));
  compute();
})();
