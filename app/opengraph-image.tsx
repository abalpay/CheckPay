import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CheckPay — Free QH Overtime Verification Tool'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const [dmSerifRes, interBoldRes, interMediumRes] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/dmserifdisplay/v15/-nFnOHM81r4j6k0gjAW3mujVU2B2G_5x0g.ttf'),
    fetch('https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.ttf'),
    fetch('https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviBhY.ttf'),
  ])

  const [dmSerif, interBold, interMedium] = await Promise.all([
    dmSerifRes.arrayBuffer(),
    interBoldRes.arrayBuffer(),
    interMediumRes.arrayBuffer(),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1a1a1a',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial gradient glow */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '1000px',
            height: '500px',
            background:
              'radial-gradient(ellipse at center, rgba(0,87,255,0.25) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.08,
            backgroundImage:
              'linear-gradient(rgba(250,250,249,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(250,250,249,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            display: 'flex',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '60px 80px',
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '100px',
              border: '1px solid rgba(0,87,255,0.4)',
              backgroundColor: 'rgba(235,241,255,0.1)',
              padding: '6px 20px',
              fontSize: '14px',
              fontFamily: 'Inter',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#5B9AFF',
            }}
          >
            QH OVERTIME ASSISTANT
          </div>

          {/* Headline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '28px',
            }}
          >
            <div
              style={{
                fontFamily: 'DMSerif',
                fontSize: '72px',
                lineHeight: 1.05,
                color: '#fafaf9',
                textAlign: 'center',
                letterSpacing: '-0.02em',
                display: 'flex',
              }}
            >
              Verify your QH overtime.
            </div>
            <div
              style={{
                fontFamily: 'DMSerif',
                fontSize: '72px',
                lineHeight: 1.05,
                color: '#fafaf9',
                textAlign: 'center',
                letterSpacing: '-0.02em',
                marginTop: '4px',
                display: 'flex',
              }}
            >
              Accurately. Confidentially.
            </div>
          </div>

          {/* Subtext */}
          <div
            style={{
              marginTop: '24px',
              fontSize: '22px',
              lineHeight: 1.5,
              color: '#C8C8C8',
              textAlign: 'center',
              fontFamily: 'Inter',
              maxWidth: '700px',
              display: 'flex',
            }}
          >
            Upload payslips & AVAC forms. Cross-check against award rules in under 60 seconds.
          </div>

          {/* Pill row */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '36px',
            }}
          >
            {['Built for QH RMOs', 'Smart rules engine', 'Secure & auto-delete'].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: '100px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    padding: '8px 18px',
                    fontSize: '15px',
                    color: '#D9D9D9',
                    fontFamily: 'Inter',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#0057ff',
                      display: 'flex',
                    }}
                  />
                  {label}
                </div>
              )
            )}
          </div>

          {/* Bottom bar - domain */}
          <div
            style={{
              position: 'absolute',
              bottom: '32px',
              left: '80px',
              right: '80px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: '24px',
                color: '#fafaf9',
                letterSpacing: '-0.01em',
                display: 'flex',
              }}
            >
              CheckPay
            </div>
            <div
              style={{
                fontFamily: 'Inter',
                fontSize: '18px',
                color: '#888888',
                display: 'flex',
              }}
            >
              checkpay.ai
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'DMSerif',
          data: dmSerif,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: interMedium,
          weight: 500,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: interBold,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  )
}
