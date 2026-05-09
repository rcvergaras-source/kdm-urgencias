import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { base64, mediaType } = await req.json()
    if (!base64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'base64 y mediaType requeridos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const isImage = mediaType.startsWith('image/')
    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Extrae los datos de esta Orden de Servicio de Transporte (OST) de Ferrovial y responde SOLO en JSON válido sin backticks ni explicaciones:
{
  "ost_numero": "número de OST (solo el número, ej: 345009)",
  "ost_om": "número de OM o Orden de Manifiesto (ej: 327240)",
  "fecha_salida": "fecha y hora de salida (ej: 01-02-2025 14:00)",
  "fecha_llegada": "fecha y hora de llegada estimada (ej: 02-02-2025 10:00)",
  "tramo": "origen y destino separados por / (ej: LA NEGRA / MEL)",
  "tipo_equipo": "tipo de equipo de transporte (ej: CAMA BAJA hasta 20)",
  "oc": "número de orden de compra u OC (ej: 4517288781)",
  "n_solicitud": "número de solicitud interna Ferrovial (ej: 638576)",
  "peso_total": "peso total (ej: 18.000)",
  "cantidad_total": "cantidad total de items",
  "conductor_titular": "nombre del conductor titular",
  "conductor_adicional": "nombre del conductor adicional o null si no hay",
  "descripcion_carga": "descripción del material transportado"
}`
            }
          ]
        }]
      })
    })

    const aiData = await resp.json()
    const text = aiData.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
