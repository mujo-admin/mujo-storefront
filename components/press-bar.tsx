// "As seen in": publications that have covered Mujo or the Protein Powder
// launch. Quiet text wordmarks, no logo files. Styles: .press-bar in
// app/globals.css. The imported pages (homepage, both Protein Powder pages)
// carry the same list as plain HTML, so change the names in all four places.
const PUBLICATIONS = [
  "VEGPRENEUR",
  "Green Queen",
  "Startup CPG",
  "vegconomist",
  "Vegan News",
];

export function PressBar() {
  return (
    <div className="press-bar" role="group" aria-label="As seen in">
      <p className="press-bar-eyebrow">As seen in</p>
      <ul className="press-bar-list">
        {PUBLICATIONS.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
