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

    // PDFs usan el bloque document; imágenes usan image
    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Extrae los datos de esta Orden de Servicio de Transporte (OST) y responde ÚNICAMENTE con un objeto JSON válido, sin backticks, sin texto adicional, sin explicaciones. Si un campo no existe en el documento usa null.

{
  "ost_numero": "número de OST",
  "ost_om": "número de OM u Orden de Manifiesto",
  "fecha_salida": "fecha y hora de salida (ej: 01-02-2025 14:00)",
  "fecha_llegada": "fecha y hora de llegada estimada",
  "tramo": "origen y destino separados por / (ej: LA NEGRA / MEL)",
  "tipo_equipo": "tipo de equipo de transporte",
  "oc": "número de orden de compra",
  "n_solicitud": "número de solicitud interna",
  "peso_total": "peso total",
  "cantidad_total": "cantidad total de items",
  "conductor_titular": "nombre del conductor titular",
  "conductor_adicional": "nombre del conductor adicional o null",
  "patente_tracto": "patente o placa del tracto/camión",
  "patente_acoplado": "patente o placa del acoplado/remolque o null",
  "descripcion_carga": "descripción del material transportado"
}`
            }
          ]
        }]
      })
    })

    const aiData = await resp.json()

    // Si Claude devuelve error de API
    if (aiData.type === 'error') {
      throw new Error(`Claude API error: ${aiData.error?.message || JSON.stringify(aiData.error)}`)
    }

    const text = aiData.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
    if (!text) {
      throw new Error(`Claude no devolvió texto. stop_reason: ${aiData.stop_reason}, raw: ${JSON.stringify(aiData).slice(0, 200)}`)
    }

    // Extraer el JSON aunque venga con texto alrededor
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`No se encontró JSON en la respuesta: ${text.slice(0, 200)}`)
    }

    const parsed = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
