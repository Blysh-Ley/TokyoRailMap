/**
 * 输入 HEX / rgb() / {r,g,b}
 * 输出：
 * - original: 原色
 * - macaron: 自动马卡龙化后的颜色
 * - deltaE00: 原色与马卡龙色的感知差异
 * - textColor: 适合放在该马卡龙背景上的字体颜色（黑/白）
 */

export function getMacaronColor(input) {
  // ---------- 工具 ----------
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function parseColor(color) {
    if (typeof color === "object" && color && "r" in color) {
      return {
        r: clamp(Math.round(color.r), 0, 255),
        g: clamp(Math.round(color.g), 0, 255),
        b: clamp(Math.round(color.b), 0, 255),
      };
    }

    if (typeof color !== "string") {
      throw new Error("Unsupported color format");
    }

    const str = color.trim();

    // HEX
    if (str.startsWith("#")) {
      let hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map(c => c + c).join("");
      }
      if (hex.length !== 6) throw new Error("Invalid HEX color");

      const num = parseInt(hex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }

    // rgb(...) / rgba(...)
    const m = str.match(/rgba?\s*\(([^)]+)\)/i);
    if (m) {
      const parts = m[1].split(",").map(s => parseFloat(s.trim()));
      if (parts.length < 3) throw new Error("Invalid rgb() color");
      return {
        r: clamp(Math.round(parts[0]), 0, 255),
        g: clamp(Math.round(parts[1]), 0, 255),
        b: clamp(Math.round(parts[2]), 0, 255),
      };
    }

    throw new Error("Unsupported color format");
  }

  function rgbToHex({ r, g, b }) {
    const toHex = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  // ---------- sRGB <-> XYZ <-> LAB ----------
  function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(v) {
    return v <= 0.0031308
      ? 12.92 * v
      : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  function rgbToXyz({ r, g, b }) {
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);

    return {
      x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
      y: (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100,
      z: (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100,
    };
  }

  function xyzToRgb({ x, y, z }) {
    x /= 100;
    y /= 100;
    z /= 100;

    const rLin = x *  3.2404542 + y * -1.5371385 + z * -0.4985314;
    const gLin = x * -0.9692660 + y *  1.8760108 + z *  0.0415560;
    const bLin = x *  0.0556434 + y * -0.2040259 + z *  1.0572252;

    const r = linearToSrgb(rLin) * 255;
    const g = linearToSrgb(gLin) * 255;
    const b = linearToSrgb(bLin) * 255;

    return { r, g, b };
  }

  function xyzToLab({ x, y, z }) {
    const Xn = 95.047;
    const Yn = 100.0;
    const Zn = 108.883;

    let xx = x / Xn;
    let yy = y / Yn;
    let zz = z / Zn;

    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);

    const fx = f(xx);
    const fy = f(yy);
    const fz = f(zz);

    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function labToXyz({ l, a, b }) {
    const Xn = 95.047;
    const Yn = 100.0;
    const Zn = 108.883;

    const fy = (l + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;

    const fInv = (t) => {
      const t3 = t * t * t;
      return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };

    return {
      x: Xn * fInv(fx),
      y: Yn * fInv(fy),
      z: Zn * fInv(fz),
    };
  }

  function rgbToLab(rgb) {
    return xyzToLab(rgbToXyz(rgb));
  }

  function labToRgb(lab) {
    return xyzToRgb(labToXyz(lab));
  }

  // ---------- LAB <-> LCH ----------
  function labToLch({ l, a, b }) {
    const c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { l, c, h };
  }

  function lchToLab({ l, c, h }) {
    const hr = h * Math.PI / 180;
    return {
      l,
      a: c * Math.cos(hr),
      b: c * Math.sin(hr),
    };
  }

  // ---------- CIEDE2000 ----------
  function ciede2000(lab1, lab2) {
    const L1 = lab1.l, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.l, a2 = lab2.a, b2 = lab2.b;

    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cbar = (C1 + C2) / 2;

    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
    const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp = 0;
    if (C1p * C2p !== 0) {
      if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
      } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
      } else {
        dhp = h2p - h1p + 360;
      }
    }

    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI / 180) / 2);

    let Lbarp = (L1 + L2) / 2;
    let Cbarp = (C1p + C2p) / 2;

    let hbarp = 0;
    if (C1p * C2p === 0) {
      hbarp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
      hbarp = (h1p + h2p) / 2;
    } else if (Math.abs(h1p - h2p) > 180 && (h1p + h2p) < 360) {
      hbarp = (h1p + h2p + 360) / 2;
    } else {
      hbarp = (h1p + h2p - 360) / 2;
    }

    const T =
      1
      - 0.17 * Math.cos((hbarp - 30) * Math.PI / 180)
      + 0.24 * Math.cos((2 * hbarp) * Math.PI / 180)
      + 0.32 * Math.cos((3 * hbarp + 6) * Math.PI / 180)
      - 0.20 * Math.cos((4 * hbarp - 63) * Math.PI / 180);

    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const Sc = 1 + 0.045 * Cbarp;
    const Sh = 1 + 0.015 * Cbarp * T;
    const Rt = -Math.sin(2 * dTheta * Math.PI / 180) * Rc;

    const dE = Math.sqrt(
      Math.pow(dLp / (kL * Sl), 2) +
      Math.pow(dCp / (kC * Sc), 2) +
      Math.pow(dHp / (kH * Sh), 2) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
    );

    return dE;
  }

  // ---------- 可见范围判断 ----------
  function inGamut(rgb) {
    return (
      rgb.r >= 0 && rgb.r <= 255 &&
      rgb.g >= 0 && rgb.g <= 255 &&
      rgb.b >= 0 && rgb.b <= 255 &&
      Number.isFinite(rgb.r) &&
      Number.isFinite(rgb.g) &&
      Number.isFinite(rgb.b)
    );
  }

  // ---------- 自动马卡龙化 ----------
  function macaronize(rgb) {
    const lab = rgbToLab(rgb);
    const lch = labToLch(lab);

    // 亮度拉高，饱和度压低
    const baseL = clamp(86 + (50 - lch.l) * 0.10, 80, 94);
    const baseC = clamp(lch.c * 0.35, 8, 28);

    // 生成多个候选，选一个最“像原色但又够马卡龙”的
    const candidates = [];
    const lSteps = [-4, -2, 0, 2, 4];
    const cSteps = [0.85, 1.0, 1.15];
    const hSteps = [0]; // 保持色相稳定，想更“柔和”可以加 ±6

    for (const dl of lSteps) {
      for (const cc of cSteps) {
        for (const dh of hSteps) {
          const candidateLch = {
            l: clamp(baseL + dl, 75, 96),
            c: clamp(baseC * cc, 4, 30),
            h: (lch.h + dh + 360) % 360,
          };

          let candidateRgb = labToRgb(lchToLab(candidateLch));

          // 如果越界，逐步降饱和直到可用
          let tries = 0;
          while (!inGamut(candidateRgb) && tries < 30) {
            candidateLch.c *= 0.92;
            candidateRgb = labToRgb(lchToLab(candidateLch));
            tries++;
          }

          candidateRgb = {
            r: clamp(Math.round(candidateRgb.r), 0, 255),
            g: clamp(Math.round(candidateRgb.g), 0, 255),
            b: clamp(Math.round(candidateRgb.b), 0, 255),
          };

          const candidateLab = rgbToLab(candidateRgb);

          // 评分：既要接近原色，又要满足“更亮、更柔和”
          const dE = ciede2000(lab, candidateLab);
          const pastelPenalty =
            Math.abs(candidateLch.l - 88) * 0.12 +
            Math.max(0, candidateLch.c - 22) * 0.8;

          candidates.push({
            rgb: candidateRgb,
            lab: candidateLab,
            score: dE + pastelPenalty,
            deltaE00: dE,
          });
        }
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0];
  }

  // ---------- 字体颜色 ----------
  function getTextColor(bgRgb) {
    // WCAG 相对亮度
    const toLinear = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };

    const lum = (rgb) =>
      0.2126 * toLinear(rgb.r) +
      0.7152 * toLinear(rgb.g) +
      0.0722 * toLinear(rgb.b);

    const Lbg = lum(bgRgb);
    const contrastBlack = (Lbg + 0.05) / 0.05;
    const contrastWhite = 1.05 / (Lbg + 0.05);

    return contrastBlack >= contrastWhite
      ? { color: "#000000", name: "黑色字体", contrast: contrastBlack }
      : { color: "#FFFFFF", name: "白色字体", contrast: contrastWhite };
  }

  function generateComplementaryMacaron(macaronRgb) {

    const lab = rgbToLab(macaronRgb);

    const lch = labToLch(lab);

    // Hue + 180°
    const complementary = {
        l: lch.l,
        c: lch.c,
        h: (lch.h + 180) % 360
    };

    const rgb = labToRgb(
        lchToLab(complementary)
    );

    return {
        rgb: {
            r: Math.round(rgb.r),
            g: Math.round(rgb.g),
            b: Math.round(rgb.b)
        },
        hex: rgbToHex(rgb)
    };
    }

    function generateInkColor(macaronRgb) {

    const lab = rgbToLab(macaronRgb);

    const lch = labToLch(lab);

    const ink = {

        // 大幅降低亮度
        l: Math.max(22, lch.l * 0.38),

        // 略增加色彩感
        c: Math.min(40, lch.c * 1.35),

        // 保持色相
        h: lch.h
    };

    const rgb = labToRgb(
        lchToLab(ink)
    );

    return {
        rgb: {
            r: Math.round(rgb.r),
            g: Math.round(rgb.g),
            b: Math.round(rgb.b)
        },
        hex: rgbToHex(rgb)
    };
}

  // ---------- 主流程 ----------
  const originalRgb = parseColor(input);
  const originalLab = rgbToLab(originalRgb);

  const macaron = macaronize(originalRgb);
  const text = getTextColor(macaron.rgb);
  const complementary = generateComplementaryMacaron(macaron.rgb);
  const ink = generateInkColor(macaron.rgb);
  const complementaryText = getTextColor(complementary.rgb);
  const inkText = getTextColor(ink.rgb);

  return {
    original: {
      rgb: originalRgb,
      hex: rgbToHex(originalRgb),
    },
    macaron: {
      rgb: macaron.rgb,
      hex: rgbToHex(macaron.rgb),
      textColor: text.color,
      textColorName: text.name,
      textContrastRatio: Number(text.contrast.toFixed(2)),
      complementary: complementary.hex,
      complementaryText: complementaryText.color,
      ink: ink.hex,
      inkText: inkText.color
    },
    deltaE00: Number(macaron.deltaE00.toFixed(2)),
  };
}
