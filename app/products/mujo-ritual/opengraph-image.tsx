import OpengraphImage from "components/opengraph-image";

export default async function Image() {
  return await OpengraphImage({
    title: "The Mujo Ritual",
    subtitle: "Mushroom coffee alternative. Lion's Mane, Cordyceps, Chaga. No crash.",
  });
}
