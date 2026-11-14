/*
  Безпечне сховище. Якщо localStorage недоступний (приватний режим,
  заблоковані дані сайту, вбудований браузер), дані живуть лише в пам'яті
  до закриття сторінки — і сторінка працює далі без помилок.
*/
(function (root) {
  'use strict';

  var PREFIX = 'masonov:';
  var memory = {};

  function get(key, fallback) {
    var raw = null;
    try {
      raw = root.localStorage.getItem(PREFIX + key);
    } catch (e) {
      raw = null;
    }
    if (raw === null && Object.prototype.hasOwnProperty.call(memory, key)) {
      raw = memory[key];
    }
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    var raw;
    try {
      raw = JSON.stringify(value);
    } catch (e) {
      return;
    }
    memory[key] = raw;
    try {
      root.localStorage.setItem(PREFIX + key, raw);
    } catch (e) {
      /* сховище недоступне — лишаємо значення в пам'яті */
    }
  }

  root.store = { get: get, set: set };
})(window);
