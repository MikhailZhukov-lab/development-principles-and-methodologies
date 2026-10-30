'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pointsForSize, parsePoints, lagrange, leastSquares, metrics, leaveOneOutRMSE, dividedDifferences, conditionNumber } = require('../math.js');

test('підготовлюються набори на 5, 10 і 20 вузлів', () => {
  assert.equal(pointsForSize(5).length, 5);
  assert.equal(pointsForSize(10).length, 8); // У відповідному рядку Excel наведено 8 пар.
  assert.equal(pointsForSize(20).length, 20);
  assert.deepEqual(pointsForSize(5)[0], { x: 0, y: 1 });
  assert.deepEqual(pointsForSize(5).at(-1), { x: 4, y: 54.6 });
  assert.deepEqual(pointsForSize(10).at(-1), { x: 3.5, y: 33.1 });
  assert.deepEqual(pointsForSize(20).at(-1), { x: 3.8, y: 44.7 });
});

test('власні точки розбираються, сортуються та приймають десяткову кому', () => {
  assert.deepEqual(parsePoints('2; 7,4\n0; 1.0\n1; 2.7'), [
    { x: 0, y: 1 }, { x: 1, y: 2.7 }, { x: 2, y: 7.4 }
  ]);
});

test('власні точки розбираються у шаблоні з нумерацією та дужками', () => {
  assert.deepEqual(parsePoints('1) [2; 7,4],\n2) [0; 1.0]'), [
    { x: 0, y: 1 }, { x: 2, y: 7.4 }
  ]);
});

test('ввід власних точок відхиляє повторні x та некоректні рядки', () => {
  assert.throws(() => parsePoints('0; 1\n0; 2'), /x мають бути різними/);
  assert.throws(() => parsePoints('0, 1\n1, 2'), /крапкою з комою/);
  assert.throws(() => parsePoints('0; 1'), /щонайменше дві точки/);
});

test('поліном Лагранжа проходить через кожен заданий вузол', () => {
  const points = pointsForSize(5);
  for (const point of points) assert.ok(Math.abs(lagrange(points, point.x) - point.y) < 1e-9);
});

test('МНК QR точно відтворює квадратичну функцію', () => {
  const points = [-2, -1, 0, 1, 2].map(x => ({ x, y: 3 - 2 * x + 0.5 * x * x }));
  const fitted = leastSquares(points, 2);
  for (const point of points) assert.ok(Math.abs(fitted(point.x) - point.y) < 1e-10);
  assert.ok(metrics(fitted, points).rss < 1e-20);
});

test('LOO-RMSE є скінченним або явно недоступним, коли вузлів замало', () => {
  for (const size of [5, 10, 20]) {
    const points = pointsForSize(size);
    assert.ok(Number.isFinite(leaveOneOutRMSE(points, 'lagrange')));
    assert.ok(Number.isFinite(leaveOneOutRMSE(points, 'leastSquares', 2)));
  }
  assert.equal(leaveOneOutRMSE(pointsForSize(5), 'leastSquares', 4), null);
});

test('коефіцієнти МНК у x відтворюють модель, а cond(A) скінченне', () => {
  const points = pointsForSize(10);
  const fit = leastSquares(points, 2);
  for (const x of [0, 1, 2, 3.5]) {
    const expanded = fit.coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
    assert.ok(Math.abs(expanded - fit(x)) < 1e-9);
  }
  assert.ok(Number.isFinite(conditionNumber(points, 2, true)));
});

test('поділені різниці Ньютона відтворюють значення у всіх вузлах', () => {
  const points = pointsForSize(5), coefficients = dividedDifferences(points);
  for (const point of points) {
    let value = coefficients.at(-1);
    for (let i = coefficients.length - 2; i >= 0; i--) value = coefficients[i] + (point.x - points[i].x) * value;
    assert.ok(Math.abs(value - point.y) < 1e-9);
  }
});

test('залишки МНК ортогональні стовпцям моделі', () => {
  const points = pointsForSize(10);
  const fitted = leastSquares(points, 2);
  const residuals = metrics(fitted, points).residuals;
  for (let degree = 0; degree <= 2; degree++) {
    const dot = points.reduce((acc, point, i) => acc + residuals[i] * (((point.x - 2) / 2) ** degree), 0);
    assert.ok(Math.abs(dot) < 1e-8);
  }
});

test('метрики повертають скінченні значення для трьох розмірів', () => {
  for (const size of [5, 10, 20]) {
    const points = pointsForSize(size);
    const result = metrics(leastSquares(points, 2), points);
    assert.ok(Number.isFinite(result.rss) && result.rss >= 0);
    assert.ok(Number.isFinite(result.rmse) && result.rmse >= 0);
    assert.ok(Number.isFinite(result.r2));
  }
});

test('степінь МНК має бути меншим за кількість вузлів', () => {
  assert.throws(() => leastSquares(pointsForSize(5), 5), /Степінь моделі/);
});
