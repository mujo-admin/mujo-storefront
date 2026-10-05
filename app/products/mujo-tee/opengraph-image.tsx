import OpengraphImage from "components/opengraph-image";

export default async function Image() {
  return await OpengraphImage({
    title: "Organic Tee",
    subtitle: "GOTS-certified organic cotton.",
  });
}
