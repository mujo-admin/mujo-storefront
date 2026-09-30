import OpengraphImage from "components/opengraph-image";

export default async function Image() {
  return await OpengraphImage({
    title: "Mujo Protein Powder",
    subtitle: "Made with Lemna leaf. 22g complete plant protein, 0g sugar.",
  });
}
