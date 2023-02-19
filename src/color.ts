import { TasmotaZbBridgePlatform } from './platform';

export class Color {

  private _brightness: number;
  private _hue: number;
  private _saturation: number;
  private _colorX: number;
  private _colorY: number;
  private _ct: number;

  constructor(readonly platform: TasmotaZbBridgePlatform) {
    this._brightness = 100;
    this._hue = 0;
    this._saturation = 0;
    this._colorX = 0;
    this._colorY = 0;
    this._ct = 0;
  }

  get brightness() {
    return this._brightness;
  }

  set brightness(b: number) {
    this._brightness = b;
  }

  get hue() {
    return this._hue;
  }

  set hue(h: number) {
    this._hue = h;
    const xy = this.HStoXY(this._hue, this._saturation);
    this._colorX = xy.colorX;
    this._colorY = xy.colorY;
  }

  get saturation() {
    return this._saturation;
  }

  set saturation(s: number) {
    this._saturation = s;
    const xy = this.HStoXY(this._hue, this._saturation);
    this._colorX = xy.colorX;
    this._colorY = xy.colorY;
  }

  get colorX() {
    return this._colorX;
  }

  set colorX(x) {
    this._colorX = x;
    const hs = this.XYtoHS(this._colorX, this._colorY, this._brightness);
    this._hue = hs.hue;
    this._saturation = hs.saturation;
  }

  get colorY() {
    return this._colorY;
  }

  set colorY(y) {
    this._colorY = y;
    const hs = this.XYtoHS(this._colorX, this._colorY, this._brightness);
    this._hue = hs.hue;
    this._saturation = hs.saturation;
  }

  get ct() {
    return this._ct;
  }

  set ct(c: number) {
    this._ct = c;
    const hs = this.platform.api.hap.ColorUtils.colorTemperatureToHueAndSaturation(this._ct);
    this._hue = hs.hue;
    this._saturation = hs.saturation;
    const xy = this.HStoXY(this._hue, this._saturation);
    this._colorX = xy.colorX;
    this._colorY = xy.colorY;
  }

  // based on: https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js
  private HStoXY(hue: number, saturation: number) {
    const h = hue / 360;
    const s = saturation / 100;

    let r = 1;
    let g = 1;
    let b = 1;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = 1 - s;
    const q = 1 - f * s;
    const t = 1 - (1 - f) * s;
    switch (i % 6) {
      case 0: g = t, b = p; break;
      case 1: r = q, b = p; break;
      case 2: r = p, b = t; break;
      case 3: r = p, g = q; break;
      case 4: r = t, g = p; break;
      case 5: g = p, b = q; break;
    }

    // apply gamma correction
    r = (r > 0.04045) ? Math.pow((r + 0.055) / (1.0 + 0.055), 2.4) : (r / 12.92);
    g = (g > 0.04045) ? Math.pow((g + 0.055) / (1.0 + 0.055), 2.4) : (g / 12.92);
    b = (b > 0.04045) ? Math.pow((b + 0.055) / (1.0 + 0.055), 2.4) : (b / 12.92);

    // Convert the RGB values to XYZ using the Wide RGB D65 conversion formula
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

    let colorX = Math.round(65535.0 * X / (X + Y + Z));
    let colorY = Math.round(65535.0 * Y / (X + Y + Z));
    if (isNaN(colorX)) {
      colorX = 0;
    }
    if (isNaN(colorY)) {
      colorY = 0;
    }

    return {
      colorX,
      colorY,
    };
  }

  private XYtoHS(colorX: number, colorY: number, brightness: number) {
    const x = colorX / 65535.0;
    const y = colorY / 65535.0;
    const z = 1.0 - x - y;

    const Y = brightness / 100;
    const X = (Y / y) * x;
    const Z = (Y / y) * z;

    //Convert to RGB using Wide RGB D65 conversion
    let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
    let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
    let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

    //If red, green or blue is larger than 1.0 set it back to the maximum of 1.0
    if (r > b && r > g && r > 1.0) {
      g = g / r;
      b = b / r;
      r = 1.0;
    } else if (g > b && g > r && g > 1.0) {
      r = r / g;
      b = b / g;
      g = 1.0;
    } else if (b > r && b > g && b > 1.0) {
      r = r / b;
      g = g / b;
      b = 1.0;
    }

    // reverse gamma correction
    r = r <= 0.0031308 ? 12.92 * r : (1.0 + 0.055) * Math.pow(r, (1.0 / 2.4)) - 0.055;
    g = g <= 0.0031308 ? 12.92 * g : (1.0 + 0.055) * Math.pow(g, (1.0 / 2.4)) - 0.055;
    b = b <= 0.0031308 ? 12.92 * b : (1.0 + 0.055) * Math.pow(b, (1.0 / 2.4)) - 0.055;

    if (isNaN(r)) {
      r = 0;
    }
    if (isNaN(g)) {
      g = 0;
    }
    if (isNaN(b)) {
      b = 0;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = (max === 0 ? 0 : d / max);

    switch (max) {
      case min: h = 0; break;
      case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
      case g: h = (b - r) + d * 2; h /= 6 * d; break;
      case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    let hue = Math.round(h * 360);
    let saturation = Math.round(s * 100);

    if (isNaN(hue)) {
      hue = 0;
    }
    if (isNaN(saturation)) {
      saturation = 0;
    }
    return {
      hue,
      saturation,
    };
  }

  // based on: https://github.com/ebaauw/homebridge-lib/blob/main/lib/Colour.js
  private CTtoXY(ct: number) {
    const kelvin = 1000000 / ct;
    let x: number, y: number;

    if (kelvin < 4000) {
      x = 11790 +
        57520658 / kelvin +
        -15358885888 / kelvin / kelvin +
        -17440695910400 / kelvin / kelvin / kelvin;
    } else {
      x = 15754 +
        14590587 / kelvin +
        138086835814 / kelvin / kelvin +
        -198301902438400 / kelvin / kelvin / kelvin;
    }
    if (kelvin < 2222) {
      y = -3312 +
        35808 * x / 0x10000 +
        -22087 * x * x / 0x100000000 +
        -18126 * x * x * x / 0x1000000000000;
    } else if (kelvin < 4000) {
      y = -2744 +
        34265 * x / 0x10000 +
        -22514 * x * x / 0x100000000 +
        -15645 * x * x * x / 0x1000000000000;
    } else {
      y = -6062 +
        61458 * x / 0x10000 +
        -96229 * x * x / 0x100000000 +
        50491 * x * x * x / 0x1000000000000;
    }
    y *= 4;
    x /= 0xFFFF;
    y /= 0xFFFF;

    const colorX = Math.round(x * 65535.0);
    const colorY = Math.round(y * 65535.0);

    return {
      colorX,
      colorY,
    };
  }

  private HSVtoRGB(hue: number, saturation: number, brightness: number) {
    const h = hue / 360;
    const s = saturation / 100;
    const v = brightness / 100;
    let r = 1;
    let g = 1;
    let b = 1;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    return {
      r,
      g,
      b,
    };
  }

  private RGBtoHSV(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = (max === 0 ? 0 : d / max);
    const v = max / 255;

    switch (max) {
      case min: h = 0; break;
      case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
      case g: h = (b - r) + d * 2; h /= 6 * d; break;
      case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return {
      hue: Math.round(h * 360),
      saturation: Math.round(s * 100),
      brightness: Math.round(v * 100),
    };
  }

}