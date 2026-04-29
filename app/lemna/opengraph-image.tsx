import OpengraphImage from "components/opengraph-image";

export default async function Image() {
  return await OpengraphImage({
    title: "The Lemna Bar.",
    subtitle: "Mujo's clean-label protein bar. Founding member access.",
  });
}
