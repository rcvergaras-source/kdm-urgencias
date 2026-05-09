import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPA_URL = Deno.env.get('SUPABASE_URL')!
const SUPA_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// MODO PRUEBA — reemplazar con correos reales en producción
const KDM_EMAIL = 'rvergara@kdmindustrial.cl'
const BHP_SUPER_EMAIL = 'rvergara@kdmindustrial.cl'   // PRUEBA → real: supervisorbhpa@kdmindustrial.cl
const OTROS_EMAIL = 'rcvergara.s@gmail.com'            // PRUEBA → real: correo del SI/solicitante
const FROM = 'Urgencias MEL <urgencias@urgenciasmel.com>'
const SITE_URL = 'https://kdm-urgencias.vercel.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

async function enviarCorreo(to: string | string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  })
  const data = await res.json()
  if (!res.ok) console.error('Resend error:', data)
  return data
}

function templateBase(contenido: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f4f1;padding:20px;">
      <div style="background:#1A1A1A;padding:16px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;">
        <span style="color:#ffffff;font-size:16px;font-weight:600;">ESCONDIDA</span>
        <span style="color:#E05E1B;font-size:16px;font-weight:600;margin-left:12px;">· BHP</span>
        <span style="color:#aaa;font-size:12px;margin-left:auto;">KDM Industrial</span>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0ddd8;">
        ${contenido}
        <hr style="border:none;border-top:1px solid #e0ddd8;margin:24px 0;" />
        <p style="color:#999;font-size:11px;margin:0;">Este es un correo automático del sistema de Urgencias MEL. No responder.</p>
      </div>
    </div>
  `
}

function filaDetalle(label: string, value: string | null | undefined) {
  if (!value) return ''
  return `<tr>
    <td style="padding:6px 8px;font-size:13px;color:#666;white-space:nowrap;">${label}</td>
    <td style="padding:6px 8px;font-size:13px;color:#1A1A1A;font-weight:500;">${value}</td>
  </tr>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { urgencia_id, tipo, evento } = await req.json()

    const sb = createClient(SUPA_URL, SUPA_SERVICE_KEY)
    const { data: u, error } = await sb.from('urgencias').select('*').eq('id', urgencia_id).single()

    if (error || !u) {
      return new Response(JSON.stringify({ error: 'Urgencia no encontrada' }), { status: 404, headers: CORS })
    }

    const num = u.numero_urg || `ID-${urgencia_id.slice(0, 8)}`
    const resultados: unknown[] = []

    // ── NUEVA SOLICITUD ──────────────────────────────────────────────
    if (evento === 'nueva_solicitud') {
      const esSobred = tipo === 'sobredimension'
      const tipoLabel = esSobred ? 'Sobredimensión' : 'Carga General'
      const nombreSuperEmail = esSobred ? u.email_super : u.si_correo

      const tablaDetalle = `
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          ${filaDetalle('N° Urgencia', num)}
          ${filaDetalle('Tipo', tipoLabel)}
          ${filaDetalle('Gerencia', u.gerencia)}
          ${filaDetalle('Superintendencia', u.superintendencia)}
          ${filaDetalle('Centro de Costo / WBS', u.centro_costo_wbs)}
          ${filaDetalle('Proveedor', u.nombre_proveedor)}
          ${filaDetalle('PO / Ítems', u.po_items)}
          ${esSobred ? filaDetalle('Dimensiones (m)', `Alto ${u.medida_alto} / Ancho ${u.medida_ancho} / Largo ${u.medida_largo}`) : ''}
          ${esSobred ? filaDetalle('Peso (TON)', u.peso_carga) : ''}
          ${esSobred ? filaDetalle('Requiere escolta', u.requiere_escolta === 'si' ? '⚠️ SÍ' : 'No') : ''}
          ${esSobred ? filaDetalle('Descripción', u.descripcion) : ''}
          ${esSobred ? filaDetalle('Justificación', u.justificacion) : ''}
          ${filaDetalle('Supervisor MEL', u.nombre_supervisor_mel)}
          ${filaDetalle('Contacto MEL', u.contacto_supervisor_mel)}
          ${filaDetalle('Punto de entrega', u.up_punto_entrega)}
          ${!esSobred && u.nombre_solicitante ? filaDetalle('Solicitante', u.nombre_solicitante) : ''}
          ${!esSobred && u.correo_solicitante ? filaDetalle('Correo solicitante', u.correo_solicitante) : ''}
        </table>
      `

      // Email al Superintendente para aprobación
      if (nombreSuperEmail && u.token_aprobacion) {
        const linkVer = `${SITE_URL}/aprobar-si?token=${u.token_aprobacion}`
        const botonesAprobacion = `
          <div style="margin:24px 0;text-align:center;">
            <a href="${linkVer}" style="display:inline-block;background:#E05E1B;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">Revisar y aprobar/rechazar solicitud</a>
          </div>
          <p style="text-align:center;font-size:12px;color:#999;">Al hacer clic podrá revisar el detalle completo y confirmar su decisión.</p>
        `
        const html = templateBase(`
          <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Nueva Solicitud de Urgencia — ${tipoLabel}</h2>
          <p style="color:#555;font-size:14px;">Estimado/a <strong>${u.firma_nombre || u.nombre_superintendente || ''}</strong>,</p>
          <p style="color:#555;font-size:14px;">Se ha registrado la solicitud <strong>${num}</strong> que requiere su aprobación para continuar con el proceso logístico.</p>
          ${tablaDetalle}
          ${botonesAprobacion}
        `)
        resultados.push(await enviarCorreo(OTROS_EMAIL, `[Urgencia ${num}] Nueva solicitud de ${tipoLabel} requiere su aprobación`, html))
      }

      // Email al solicitante (solo carga general)
      if (!esSobred) {
        const html = templateBase(`
          <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Solicitud de Urgencia Registrada</h2>
          <p style="color:#555;font-size:14px;">Estimado/a <strong>${u.nombre_solicitante || ''}</strong>,</p>
          <p style="color:#555;font-size:14px;">Su solicitud de urgencia ha sido registrada con el número <strong>${num}</strong>. Se ha notificado al Superintendente para su aprobación.</p>
          ${tablaDetalle}
        `)
        resultados.push(await enviarCorreo(OTROS_EMAIL, `[Urgencia ${num}] Su solicitud fue registrada correctamente`, html))
      }

      // Email al Supervisor BHP
      const htmlBHP = templateBase(`
        <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Nueva Solicitud de Urgencia — ${tipoLabel}</h2>
        <p style="color:#555;font-size:14px;">Se ha registrado una nueva solicitud de urgencia que requiere gestión logística:</p>
        ${tablaDetalle}
      `)
      resultados.push(await enviarCorreo(BHP_SUPER_EMAIL, `[Urgencia ${num}] Nueva solicitud ${tipoLabel}`, htmlBHP))

      // Email a KDM
      const htmlKDM = templateBase(`
        <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Nueva Urgencia ${tipoLabel} — Acción requerida</h2>
        <p style="color:#555;font-size:14px;">Se ha recibido una nueva solicitud de urgencia:</p>
        ${tablaDetalle}
      `)
      resultados.push(await enviarCorreo(KDM_EMAIL, `[Urgencia ${num}] Nueva solicitud ${tipoLabel} — KDM`, htmlKDM))
    }

    // ── COMPLETADO (KDM) ─────────────────────────────────────────────
    if (evento === 'completado') {
      const html = templateBase(`
        <h2 style="color:#2D7D46;font-size:18px;margin:0 0 8px;">Urgencia Completada</h2>
        <p style="color:#555;font-size:14px;">La urgencia <strong>${num}</strong> ha sido marcada como completada por el equipo KDM.</p>
        ${filaDetalle('N° Urgencia', num)}
        ${filaDetalle('Proveedor', u.nombre_proveedor)}
        ${filaDetalle('Punto de entrega', u.up_punto_entrega)}
      `)
      resultados.push(await enviarCorreo([BHP_SUPER_EMAIL, KDM_EMAIL], `[Urgencia ${num}] Completada`, html))
    }

    // ── DESPACHADO FERROVIAL ─────────────────────────────────────────
    if (evento === 'despachado_ferrovial') {
      const html = templateBase(`
        <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Urgencia Despachada por Ferrovial</h2>
        <p style="color:#555;font-size:14px;">La urgencia <strong>${num}</strong> ha sido despachada por Ferrovial.</p>
        ${filaDetalle('N° Urgencia', num)}
        ${filaDetalle('Proveedor', u.nombre_proveedor)}
        ${filaDetalle('Punto de entrega', u.up_punto_entrega)}
      `)
      resultados.push(await enviarCorreo([BHP_SUPER_EMAIL, KDM_EMAIL], `[Urgencia ${num}] Despachada por Ferrovial`, html))
    }

    // ── OTROS ESTADOS (sobred-supervisor) ────────────────────────────
    const estadosNotificables: Record<string, string> = {
      aprobada: 'Solicitud Aprobada por Supervisor BHP',
      rechazada: 'Solicitud Rechazada por Supervisor BHP',
      en_correccion: 'Corrección Solicitada por Supervisor BHP',
      aprobado_supervisor: 'Solicitud Aprobada por Supervisor BHP',
      rechazado_supervisor: 'Solicitud Rechazada por Supervisor BHP',
      en_transito_p3: 'En Tránsito hacia Patio 3',
      recibido_p3: 'Recibido en Patio 3',
      cerrado_entregado: 'Urgencia Cerrada — Entregada',
    }

    if (estadosNotificables[evento]) {
      const titulo = estadosNotificables[evento]
      const comentario = u.comentario_supervisor || u.obs_supervisor || null

      const html = templateBase(`
        <h2 style="font-size:18px;margin:0 0 8px;">${titulo}</h2>
        <p style="color:#555;font-size:14px;">La urgencia <strong>${num}</strong> ha cambiado de estado: <strong>${titulo}</strong>.</p>
        ${filaDetalle('N° Urgencia', num)}
        ${filaDetalle('Proveedor', u.nombre_proveedor)}
        ${filaDetalle('Punto de entrega', u.up_punto_entrega)}
        ${comentario ? filaDetalle('Comentario supervisor', comentario) : ''}
      `)

      // Destinatarios según el evento
      let destinatarios: string[] = []

      if (evento === 'en_correccion') {
        // Correo al solicitante con link directo al formulario pre-llenado
        const linkCorreccion = `${SITE_URL}/carga-general?id=${encodeURIComponent(num)}`
        const htmlCorreccion = templateBase(`
          <h2 style="color:#E05E1B;font-size:18px;margin:0 0 8px;">Corrección Solicitada — Urgencia ${num}</h2>
          <p style="color:#555;font-size:14px;">El Supervisor BHP ha solicitado una corrección en su solicitud de urgencia <strong>${num}</strong>.</p>
          ${comentario ? `
          <div style="background:#FFF8F0;border-left:4px solid #E05E1B;border-radius:4px;padding:12px 16px;margin:16px 0;">
            <p style="font-size:12px;font-weight:600;color:#E05E1B;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Motivo indicado por el Supervisor</p>
            <p style="font-size:14px;color:#333;margin:0;">${comentario}</p>
          </div>` : ''}
          <p style="color:#555;font-size:14px;">Haga clic en el botón para abrir el formulario con sus datos pre-cargados, realice las correcciones necesarias y envíe nuevamente.</p>
          <div style="margin:24px 0;text-align:center;">
            <a href="${linkCorreccion}" style="display:inline-block;background:#E05E1B;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">Corregir solicitud ${num}</a>
          </div>
          <p style="text-align:center;font-size:12px;color:#999;">El formulario se abrirá con todos sus datos anteriores pre-cargados para que solo corrija lo necesario.</p>
        `)
        resultados.push(await enviarCorreo(OTROS_EMAIL, `[Urgencia ${num}] Corrección solicitada por Supervisor BHP`, htmlCorreccion))
      } else {
        if (evento === 'rechazada' || evento === 'rechazado_supervisor') {
          destinatarios = [OTROS_EMAIL]
        } else if (evento === 'aprobada' || evento === 'aprobado_supervisor') {
          destinatarios = [KDM_EMAIL]
        } else {
          destinatarios = [KDM_EMAIL, BHP_SUPER_EMAIL]
        }
        resultados.push(await enviarCorreo(destinatarios, `[Urgencia ${num}] ${titulo}`, html))
      }
    }

    return new Response(JSON.stringify({ ok: true, evento, resultados }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
