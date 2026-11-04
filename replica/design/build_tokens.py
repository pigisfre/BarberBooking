#!/usr/bin/env python3
"""Genera tokens.css e tailwind.tokens.js da tokens.json, opzionalmente con il brand di un cliente.

    python3 replica/design/build_tokens.py                                  # token base
    python3 replica/design/build_tokens.py --brand brands/<cliente>/brand.json --out build/<cliente>

Dal brand si legge solo "accent" (e opzionalmente "accentDark"). Gli altri token brand
si derivano in modo che il contrasto WCAG AA sia sempre rispettato:
  on-accent   = bianco o quasi-nero, quello con piu contrasto sull'accent (minimo 4.5)
  accent-text = accent scurito (tema chiaro) o schiarito (tema scuro) finche fa 4.5:1
                su surface e su bg
  accent-tint = accent al 10% (chiaro) / 22% (scuro) su surface
Esce con codice 1 se un colore del brand non si puo rendere leggibile.
Solo libreria standard.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c))) for c in rgb)


def lum(h):
    def ch(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def mix(a, b, t):
    """t=0 -> a, t=1 -> b."""
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(tuple(x + (y - x) * t for x, y in zip(ra, rb)))


def hue(h):
    """Tinta HSL in gradi; None per i grigi (saturazione quasi nulla)."""
    r, g, b = (c / 255.0 for c in hex_to_rgb(h))
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 0.08:
        return None
    d = mx - mn
    if mx == r:
        x = ((g - b) / d) % 6
    elif mx == g:
        x = (b - r) / d + 2
    else:
        x = (r - g) / d + 4
    return x * 60.0


def readable_on(accent, backgrounds, toward, need=4.5):
    """Mescola accent verso `toward` (nero o bianco) finche passa su tutti i backgrounds."""
    for i in range(0, 101):
        c = mix(accent, toward, i / 100.0)
        if all(ratio(c, bg) >= need for bg in backgrounds):
            return c
    return None


def derive_brand(theme_colors, accent, dark):
    if ratio(accent, theme_colors["surface"]) < 3.0:
        fixed = readable_on(accent, [theme_colors["surface"], theme_colors["bg"]],
                            "#ffffff" if dark else "#000000", 3.0)
        if fixed is None:
            raise ValueError("accent %s: impossibile renderlo visibile su surface" % accent)
        print("avviso: accent %s poco visibile su surface (%.2f:1), corretto in %s (%.2f:1)"
              % (accent, ratio(accent, theme_colors["surface"]), fixed, ratio(fixed, theme_colors["surface"])),
              file=sys.stderr)
        accent = fixed
    out = {"accent": accent}
    white, ink = "#ffffff", "#0b0b0d"
    on = white if ratio(white, accent) >= ratio(ink, accent) else ink
    if ratio(on, accent) < 4.5:
        raise ValueError("accent %s: nessun testo leggibile sopra (max %.2f:1)" % (accent, ratio(on, accent)))
    out["on-accent"] = on
    out["accent-tint"] = mix(theme_colors["surface"], accent, 0.22 if dark else 0.10)
    bgs = [theme_colors["surface"], theme_colors["bg"], out["accent-tint"]]
    txt = readable_on(accent, bgs, "#ffffff" if dark else "#000000")
    if txt is None:
        raise ValueError("accent %s: impossibile ricavare un accent-text leggibile" % accent)
    out["accent-text"] = txt
    return out


def css_block(selector, colors):
    lines = ["%s {" % selector]
    for k, v in colors.items():
        r, g, b = hex_to_rgb(v)
        lines.append("  --color-%s: %d %d %d;" % (k, r, g, b))
    lines.append("}")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tokens", default=os.path.join(HERE, "tokens.json"))
    ap.add_argument("--brand")
    ap.add_argument("--out", default=HERE)
    a = ap.parse_args(argv)

    tokens = json.load(open(a.tokens, encoding="utf-8"))
    light = dict(tokens["color"]["light"])
    dark = dict(tokens["color"]["dark"])

    if a.brand:
        brand = json.load(open(a.brand, encoding="utf-8"))
        brand = brand.get("theme", brand)   # brands/<id>/brand.json ha i colori sotto "theme"
        ha, hd = hue(brand["accent"]), hue(light["danger"])
        if ha is not None and hd is not None and min(abs(ha - hd), 360 - abs(ha - hd)) < 25:
            print("avviso: l'accent %s ha una tinta vicina al rosso di 'danger': pulsante principale e "
                  "azioni distruttive si confondono. Valuta un'icona/etichetta piu marcata o un accent diverso."
                  % brand["accent"], file=sys.stderr)
        try:
            light.update(derive_brand(light, brand["accent"], dark=False))
            dark.update(derive_brand(dark, brand.get("accentDark") or
                                     readable_on(brand["accent"], [dark["surface"]], "#ffffff", 3.0) or brand["accent"],
                                     dark=True))
        except ValueError as e:
            print("brand non valido: %s" % e, file=sys.stderr)
            return 1

    os.makedirs(a.out, exist_ok=True)
    css = [
        "/* Generato da build_tokens.py: non modificare a mano. Colori come canali RGB per Tailwind/NativeWind. */",
        css_block(":root", light),
        "@media (prefers-color-scheme: dark) {\n" + css_block(":root:not([data-theme=\"light\"])", dark).replace("\n", "\n  ").replace(":root:not", "  :root:not", 1) + "\n}",
        css_block(":root[data-theme=\"dark\"]", dark),
    ]
    open(os.path.join(a.out, "tokens.css"), "w", encoding="utf-8").write("\n\n".join(css) + "\n")

    t = tokens
    colors = {k: "rgb(var(--color-%s) / <alpha-value>)" % k for k in light}
    font_size = {k: ["%dpx" % v["size"], {"lineHeight": "%dpx" % v["line"], "fontWeight": str(v["weight"]),
                                          "letterSpacing": "%gem" % v["tracking"]}]
                 for k, v in t["type"].items() if not k.startswith("_")}
    theme = {
        "colors": colors,
        "fontFamily": {"sans": [t["font"]["sans"]], "mono": [t["font"]["mono"]]},
        "fontSize": font_size,
        "spacing": {str(v): "%dpx" % v for v in t["space"]},
        "borderRadius": {k: "%dpx" % v for k, v in t["radius"].items() if not k.startswith("_")},
        "boxShadow": {k: v for k, v in t["shadow"].items() if not k.startswith("_")},
        "screens": {k: "%dpx" % v for k, v in t["layout"]["breakpoints"].items() if v},
    }
    js = ("// Generato da build_tokens.py: non modificare a mano.\n"
          "// Uso: tailwind.config.js -> theme: { extend: require('./tailwind.tokens.js') }\n"
          "module.exports = " + json.dumps(theme, indent=2, ensure_ascii=False) + ";\n")
    open(os.path.join(a.out, "tailwind.tokens.js"), "w", encoding="utf-8").write(js)

    # token risolti (per contrast.py e per l'app in runtime)
    resolved = dict(tokens)
    resolved["color"] = {"light": light, "dark": dark}
    resolved_path = os.path.join(a.out, "tokens.resolved.json")
    json.dump(resolved, open(resolved_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    # gate: stesso controllo di contrast.py su ogni coppia dichiarata in tokens.json
    fails = []
    for p in tokens.get("pairs", []):
        th, fg = p[0].split("-", 1)
        bg = p[1].split("-", 1)[1]
        need = 3.0 if len(p) > 2 and p[2] in ("ui", "large") else 4.5
        cols = light if th == "light" else dark
        r = ratio(cols[fg], cols[bg])
        if r < need:
            fails.append("%s on %s: %.2f:1 (serve %.1f)" % (p[0], p[1], r, need))
    if fails:
        print("contrasto insufficiente:\n  " + "\n  ".join(fails), file=sys.stderr)
        return 1
    print("ok: %s (%d coppie AA)" % (a.out, len(tokens.get("pairs", []))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
