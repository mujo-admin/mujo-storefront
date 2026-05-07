// Mujo session login-link email — sent by /api/auth/magic-link.
// Mirror of magic-link.tsx but with copy + expiry tuned for the 7-day session
// audience instead of the 15-min billing-portal audience.

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

type Props = {
  href: string;
  email: string;
};

const ORANGE = '#f2682f';
const INK = '#0f0f0f';
const CREAM = '#f5f0e6';

export function LoginLinkEmail({ href, email }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your Mujo login link — works for 7 days</Preview>
      <Body
        style={{
          backgroundColor: CREAM,
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <Container style={{ maxWidth: 540, margin: '0 auto', padding: '40px 24px' }}>
          <Section>
            <Heading
              as="h1"
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 28,
                fontWeight: 400,
                color: INK,
                margin: '0 0 16px 0',
                lineHeight: 1.2,
              }}
            >
              Your Mujo login link
            </Heading>
            <Text
              style={{ fontSize: 16, color: INK, lineHeight: 1.5, margin: '0 0 24px 0' }}
            >
              You (or someone using {email}) requested a login link for your
              Mujo account. Click below to sign in — no password required.
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={href}
                style={{
                  backgroundColor: ORANGE,
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: 'none',
                  padding: '14px 28px',
                  borderRadius: 999,
                  display: 'inline-block',
                  letterSpacing: 0.2,
                }}
              >
                Sign in to Mujo
              </Button>
            </Section>

            <Text
              style={{
                fontSize: 14,
                color: '#555',
                lineHeight: 1.5,
                margin: '0 0 8px 0',
              }}
            >
              This link works for 7 days and can only be used once.
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: '#555',
                lineHeight: 1.5,
                margin: '0 0 24px 0',
              }}
            >
              If you didn&apos;t request this, you can safely ignore this
              email — no changes were made.
            </Text>

            <Hr style={{ borderColor: '#ddd', margin: '32px 0' }} />

            <Text
              style={{ fontSize: 13, color: '#777', lineHeight: 1.5, margin: 0 }}
            >
              Need help? Reply to this email or reach us at{' '}
              <a href="mailto:hello@mujoworld.com" style={{ color: INK }}>
                hello@mujoworld.com
              </a>
              .
            </Text>
            <Text style={{ fontSize: 12, color: '#999', margin: '24px 0 0 0' }}>
              Mujo Co. — modern performance without the crash.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default LoginLinkEmail;
