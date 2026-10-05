import OpengraphImage from "components/opengraph-image";

export default async function Image() {
  return await OpengraphImage({
    title: "The Ritual",
    subtitle: "A coffee alternative that tastes like a smooth mocha. Under 5mg of caffeine.",
  });
}
