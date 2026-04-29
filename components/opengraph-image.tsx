import { ImageResponse } from "next/og";
import { join } from "path";
import { readFile } from "fs/promises";

export type Props = {
  title?: string;
  subtitle?: string;
};

const CREAM = "#F3F2E9";
const INK = "#1A1A1A";
const ORANGE = "#F2682F";

export default async function OpengraphImage(
  props?: Props,
): Promise<ImageResponse> {
  const { title, subtitle } = {
    title: process.env.SITE_NAME ?? "Mujo",
    subtitle: "Modern performance without the crash.",
    ...props,
  };

  const file = await readFile(join(process.cwd(), "./fonts/Inter-Bold.ttf"));
  const font = Uint8Array.from(file).buffer;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: CREAM,
          color: INK,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: ORANGE,
            marginBottom: 32,
            fontWeight: 700,
          }}
        >
          MUJO
        </div>
        <div
          style={{
            fontSize: 84,
            lineHeight: 1.05,
            fontWeight: 700,
            maxWidth: 980,
            letterSpacing: "-0.02em",
            color: INK,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 30,
              marginTop: 24,
              color: "#4A4845",
              maxWidth: 980,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: font,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
