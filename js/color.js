/* Цветовая математика «Погреба»: смешивание в OKLab и подбор контрастного текста.
   Работает и в браузере (window.PogrebColor), и в Node (для генерации статичных тонов). */
(function (root) {
  'use strict';

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.round(clamp(v, 0, 255)).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return v * 255; }

  function rgbToOklab(rgb) {
    var r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function oklabToRgb(lab) {
    var l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
    var m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
    var s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2], 3);
    return [
      fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  function mix(a, b, t) {
    var A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b));
    return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
  }
  function luminance(hex) {
    var c = hexToRgb(hex);
    return 0.2126 * toLin(c[0]) + 0.7152 * toLin(c[1]) + 0.0722 * toLin(c[2]);
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  var DARK_INK = '#24120f';
  var LIGHT_INK = '#f8eedf';

  /* Подбирает весь набор переменных для заданного фона.
     Гарантия: основной и приглушённый текст ≥ 4.5:1 и на фоне, и на «поверхности» карточек,
     линии полей ввода ≥ 3:1. Если тёплые чернила не дотягивают — уводим их к чистому чёрному/белому. */
  function palette(bg, wine) {
    var useDark = contrast(bg, '#000000') >= contrast(bg, '#ffffff');
    var base = useDark ? DARK_INK : LIGHT_INK;
    var extreme = useDark ? '#000000' : '#ffffff';
    var away = useDark ? '#ffffff' : '#000000';
    // поверхность уходит ОТ чернил, поэтому контраст на карточках только растёт
    var surface = mix(bg, away, useDark ? 0.42 : 0.22);
    var ink = base, t = 0;
    while (contrast(ink, bg) < 4.6 && t < 1) { t += 0.1; ink = mix(base, extreme, Math.min(1, t)); }
    var muted = ink;
    for (var k = 0.45; k > 0; k -= 0.03) {
      var cand = mix(ink, bg, k);
      if (contrast(cand, bg) >= 4.6) { muted = cand; break; }
    }
    var lineStrong = ink;
    for (var j = 0.7; j > 0; j -= 0.03) {
      var c2 = mix(ink, bg, j);
      if (contrast(c2, bg) >= 3.1) { lineStrong = c2; break; }
    }
    return {
      bg: bg,
      ink: ink,
      muted: muted,
      line: mix(ink, bg, 0.82),
      lineStrong: lineStrong,
      surface: surface,
      wine: wine || '#8c2433',
      scheme: useDark ? 'light' : 'dark'
    };
  }

  /* Тоны по ходу страницы: «белое» → «розе» → «красное» → подвал */
  var TONES = {
    straw:  { bg: '#f1e4b3', wine: '#e6c45a' },
    pale:   { bg: '#f5edd2', wine: '#e2b94a' },
    blush:  { bg: '#f6d9cf', wine: '#ef9a86' },
    rose:   { bg: '#eeb7aa', wine: '#e36f66' },
    garnet: { bg: '#8a2333', wine: '#b5172f' },
    bordo:  { bg: '#541322', wine: '#8e0f28' },
    deep:   { bg: '#2d0d15', wine: '#6e0a1e' },
    cellar: { bg: '#130a0b', wine: '#4a0714' }
  };

  var api = { hexToRgb: hexToRgb, rgbToHex: rgbToHex, mix: mix, contrast: contrast, luminance: luminance, palette: palette, TONES: TONES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PogrebColor = api;
})(this);
