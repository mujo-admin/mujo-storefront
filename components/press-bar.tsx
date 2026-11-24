// "As seen in": publications that have covered Mujo or the Protein Powder
// launch. Quiet one-colour logos. Styles: .press-bar in
// app/globals.css. The imported pages (homepage, both Protein Powder pages,
// both Ritual pages) carry the same list as plain HTML, so change the names
// in all six places.
// Logo files: public/images/press/ (one colour, clear background, made from
// the files Kinga supplied 2026-11-24). A publication without a file shows as
// text. "lines" sets the display height: one-line or two-line wordmark.
const PUBLICATIONS: {
  name: string;
  logo?: { slug: string; width: number; height: number; lines: "one" | "two" };
}[] = [
  { name: "VEGPRENEUR", logo: { slug: "vegpreneur", width: 317, height: 44, lines: "one" } },
  { name: "Green Queen", logo: { slug: "green-queen", width: 295, height: 96, lines: "two" } },
  { name: "Startup CPG", logo: { slug: "startup-cpg", width: 221, height: 96, lines: "two" } },
  { name: "vegconomist", logo: { slug: "vegconomist", width: 309, height: 52, lines: "one" } },
  { name: "Vegan News" },
];

export function PressBar() {
  return (
    <div className="press-bar" role="group" aria-label="As seen in">
      <p className="press-bar-eyebrow">As seen in</p>
      <ul className="press-bar-list">
        {PUBLICATIONS.map(({ name, logo }) => (
          <li key={name}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`press-logo press-logo--${logo.lines}`}
                src={`/images/press/${logo.slug}.png`}
                alt={name}
                width={logo.width}
                height={logo.height}
              />
            ) : (
              name
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
