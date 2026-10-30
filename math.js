(() => {
  'use strict';
  const datasets = {
    5: [
    { x: 0, y: 1.0 }, { x: 1, y: 2.7 }, { x: 2, y: 7.4 }, { x: 3, y: 20.1 }, { x: 4, y: 54.6 }
    ],
    10: [
      { x: 0, y: 1.0 }, { x: 0.5, y: 1.6 }, { x: 1, y: 2.7 }, { x: 1.5, y: 4.5 },
      { x: 2, y: 7.4 }, { x: 2.5, y: 12.2 }, { x: 3, y: 20.1 }, { x: 3.5, y: 33.1 }
    ],
    20: [
      { x: 0, y: 1.0 }, { x: 0.2, y: 1.2 }, { x: 0.4, y: 1.5 }, { x: 0.6, y: 1.8 },
      { x: 0.8, y: 2.2 }, { x: 1.0, y: 2.7 }, { x: 1.2, y: 3.3 }, { x: 1.4, y: 4.1 },
      { x: 1.6, y: 5.0 }, { x: 1.8, y: 6.1 }, { x: 2.0, y: 7.4 }, { x: 2.2, y: 9.0 },
      { x: 2.4, y: 11.0 }, { x: 2.6, y: 13.5 }, { x: 2.8, y: 16.4 }, { x: 3.0, y: 20.1 },
      { x: 3.2, y: 24.5 }, { x: 3.4, y: 30.0 }, { x: 3.6, y: 36.6 }, { x: 3.8, y: 44.7 }
    ]
  };
  function pointsForSize(size) {
    if (!datasets[size]) throw new Error('Невідомий розмір набору точок.');
    return datasets[size].map(point => ({ ...point }));
  }
  function parsePoints(text) {
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (rows.length < 2) throw new Error('Введіть щонайменше дві точки — по одній парі x; y у рядку.');
    const points = rows.map((source, index) => {
      const row = source.replace(/^\s*\d+\)\s*/, '').trim().replace(/^\[\s*/, '').replace(/\]\s*,?\s*$/, '');
      const values = row.split(';');
      if (values.length !== 2) throw new Error(`Рядок ${index + 1}: розділіть x та y крапкою з комою; формат: ${index + 1}) [x; y],`);
      const parseNumber = value => Number(value.trim().replace(',', '.'));
      const x = parseNumber(values[0]), y = parseNumber(values[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Рядок ${index + 1}: x та y мають бути скінченними числами.`);
      return { x, y };
    }).sort((a, b) => a.x - b.x);
    if (new Set(points.map(point => point.x)).size !== points.length) throw new Error('Координати x мають бути різними.');
    return points;
  }
  function lagrange(points, x) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      let basis = 1;
      for (let j = 0; j < points.length; j++) if (j !== i) basis *= (x - points[j].x) / (points[i].x - points[j].x);
      sum += points[i].y * basis;
    }
    return sum;
  }
  // Householder QR on a normalized Vandermonde matrix avoids normal equations.
  function leastSquares(points, degree) {
    if (degree < 0 || degree >= points.length) throw new Error('Степінь моделі має бути меншим за кількість вузлів.');
    const center = (points[0].x + points.at(-1).x) / 2;
    const radius = (points.at(-1).x - points[0].x) / 2 || 1;
    const A = points.map(p => {
      const t = (p.x - center) / radius;
      return Array.from({ length: degree + 1 }, (_, k) => t ** k);
    });
    const b = points.map(p => p.y);
    const rows = A.length, cols = degree + 1;
    for (let k = 0; k < cols; k++) {
      let norm = 0;
      for (let i = k; i < rows; i++) norm = Math.hypot(norm, A[i][k]);
      if (norm < 1e-14) throw new Error('Недостатньо незалежних вузлів для вибраного степеня.');
      const alpha = A[k][k] >= 0 ? -norm : norm;
      const v = Array.from({ length: rows - k }, (_, i) => A[i + k][k]);
      v[0] -= alpha;
      const vv = v.reduce((sum, q) => sum + q * q, 0);
      if (vv < 1e-28) continue;
      const beta = 2 / vv;
      for (let j = k; j < cols; j++) {
        let dot = 0;
        for (let i = k; i < rows; i++) dot += v[i - k] * A[i][j];
        for (let i = k; i < rows; i++) A[i][j] -= beta * v[i - k] * dot;
      }
      let dotB = 0;
      for (let i = k; i < rows; i++) dotB += v[i - k] * b[i];
      for (let i = k; i < rows; i++) b[i] -= beta * v[i - k] * dotB;
    }
    const coefficients = Array(cols).fill(0);
    for (let i = cols - 1; i >= 0; i--) {
      let value = b[i];
      for (let j = i + 1; j < cols; j++) value -= A[i][j] * coefficients[j];
      coefficients[i] = value / A[i][i];
    }
    const xCoefficients = Array(cols).fill(0);
    const choose = (n, r) => {
      let result = 1;
      for (let i = 1; i <= r; i++) result = result * (n - r + i) / i;
      return result;
    };
    for (let k = 0; k < cols; k++) {
      for (let j = 0; j <= k; j++) {
        xCoefficients[j] += coefficients[k] * choose(k, j) * ((-center) ** (k - j)) / (radius ** k);
      }
    }
    const evaluate = x => {
      const t = (x - center) / radius;
      let y = 0;
      for (let i = coefficients.length - 1; i >= 0; i--) y = y * t + coefficients[i];
      return y;
    };
    evaluate.coefficients = xCoefficients;
    evaluate.normalizedCoefficients = coefficients;
    evaluate.center = center;
    evaluate.radius = radius;
    return evaluate;
  }
  function metrics(fn, points) {
    const residuals = points.map(p => p.y - fn(p.x));
    const rss = residuals.reduce((a, b) => a + b * b, 0);
    const mean = points.reduce((a, p) => a + p.y, 0) / points.length;
    const tss = points.reduce((a, p) => a + (p.y - mean) ** 2, 0);
    return { rss, rmse: Math.sqrt(rss / points.length), r2: tss ? 1 - rss / tss : 1, residuals };
  }
  function leaveOneOutRMSE(points, method, degree = 2) {
    if (method === 'leastSquares' && points.length <= degree + 1) return null;
    let squaredError = 0;
    for (let i = 0; i < points.length; i++) {
      const training = points.filter((_, index) => index !== i);
      const estimate = method === 'lagrange'
        ? lagrange(training, points[i].x)
        : leastSquares(training, degree)(points[i].x);
      squaredError += (points[i].y - estimate) ** 2;
    }
    return Math.sqrt(squaredError / points.length);
  }
  function dividedDifferences(points) {
    const values = points.map(point => point.y);
    const coefficients = [values[0]];
    for (let order = 1; order < points.length; order++) {
      for (let i = points.length - 1; i >= order; i--) {
        values[i] = (values[i] - values[i - 1]) / (points[i].x - points[i - order].x);
      }
      coefficients.push(values[order]);
    }
    return coefficients;
  }
  function conditionNumber(points, degree, normalized = true) {
    const center = (points[0].x + points.at(-1).x) / 2;
    const radius = (points.at(-1).x - points[0].x) / 2 || 1;
    const columns = degree + 1;
    const gram = Array.from({ length: columns }, () => Array(columns).fill(0));
    for (const point of points) {
      const x = normalized ? (point.x - center) / radius : point.x;
      const row = Array.from({ length: columns }, (_, power) => x ** power);
      for (let r = 0; r < columns; r++) for (let c = r; c < columns; c++) gram[r][c] += row[r] * row[c];
    }
    for (let r = 0; r < columns; r++) for (let c = 0; c < r; c++) gram[r][c] = gram[c][r];
    for (let sweep = 0; sweep < 100 * columns * columns; sweep++) {
      let p = 0, q = 0, largest = 0;
      for (let r = 0; r < columns; r++) for (let c = r + 1; c < columns; c++) {
        if (Math.abs(gram[r][c]) > largest) { largest = Math.abs(gram[r][c]); p = r; q = c; }
      }
      if (largest < 1e-14) break;
      const apq = gram[p][q], tau = (gram[q][q] - gram[p][p]) / (2 * apq);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const cosine = 1 / Math.sqrt(1 + t * t), sine = t * cosine;
      const app = gram[p][p], aqq = gram[q][q];
      gram[p][p] = app - t * apq; gram[q][q] = aqq + t * apq; gram[p][q] = 0; gram[q][p] = 0;
      for (let r = 0; r < columns; r++) if (r !== p && r !== q) {
        const arp = gram[r][p], arq = gram[r][q];
        gram[r][p] = gram[p][r] = cosine * arp - sine * arq;
        gram[r][q] = gram[q][r] = sine * arp + cosine * arq;
      }
    }
    const eigenvalues = gram.map((row, i) => row[i]).filter(value => value > 0);
    if (eigenvalues.length !== columns) return Infinity;
    return Math.sqrt(Math.max(...eigenvalues) / Math.min(...eigenvalues));
  }
  const api = { pointsForSize, parsePoints, lagrange, leastSquares, metrics, leaveOneOutRMSE, dividedDifferences, conditionNumber };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ApproxMath = api;
})();
