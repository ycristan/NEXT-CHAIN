import { forwardRef, useImperativeHandle, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────
export interface HoverBrand {
  id: string
  brand_code: string
  brand_name: string
}

export interface PreviewHandle {
  show: (brand: HoverBrand, image: string | null, loading: boolean) => void
  hide: () => void
}

// ── Component ──────────────────────────────────────────────────
// State lives here — updates to the preview never cause PickingLine to re-render.
export const PLSlotImagePreview = forwardRef<PreviewHandle>(
  function PLSlotImagePreview(_, ref) {
    const [brand, setBrand] = useState<HoverBrand | null>(null)
    const [image, setImage] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useImperativeHandle(ref, () => ({
      show(b, img, ld) { setBrand(b); setImage(img); setLoading(ld) },
      hide()           { setBrand(null); setImage(null); setLoading(false) },
    }), [])

    return (
      <div style={{
        width: 96,
        height: 96,
        flexShrink: 0,
        position: 'relative',          // anchors the shimmer's position:absolute
        background: '#f5f5f4',
        border: '1px solid #e7e5e4',
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {loading ? (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, #e7e5e4 25%, #f5f5f4 50%, #e7e5e4 75%)',
            backgroundSize: '200% 100%',
            animation: 'pl-shimmer 1.4s ease-in-out infinite',
          }} />
        ) : brand && image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : null}

        <style>{`
          @keyframes pl-shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    )
  }
)
