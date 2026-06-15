import { insertRow, resolveAuthUserId, selectMany, selectOne, updateRows } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { pushLineMessages, textLineMessage } from '../_shared/line.ts';
import type { ChatMessageRow, ChatSessionRow } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  action: z.enum(['reply', 'set_mode']),
  agent_mode: z.enum(['ai', 'human']).optional(),
  session_id: z.string().uuid(),
  text: z.string().trim().min(1).max(4500).optional(),
});

type Embedded<T> = T | T[] | null;

type SessionRow = Pick<ChatSessionRow, 'agent_mode' | 'channel' | 'customer_id' | 'id' | 'tenant_id'> & {
  customers: Embedded<{ line_user_id: string | null }>;
  tenants: Embedded<{ slug: string }>;
};

function embeddedOne<T>(value: Embedded<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

const SESSION_SELECT = 'id,tenant_id,customer_id,channel,agent_mode,customers(line_user_id),tenants(slug)';

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    const body = await validateJson(req, requestSchema);
    const authUserId = await resolveAuthUserId(req.headers.get('authorization'));
    const memberships = await selectMany<{ role: string; tenant_id: string }>('tenant_members', {
      auth_user_id: `eq.${authUserId}`,
      select: 'tenant_id,role',
    });

    if (memberships.length === 0) {
      throw new HttpError('VALIDATION', 'Not allowed for this tenant.', 403);
    }

    const membershipByTenant = new Map(memberships.map((membership) => [membership.tenant_id, membership.role]));
    const tenantFilter = memberships.map((membership) => membership.tenant_id).join(',');
    const session = await selectOne<SessionRow>('chat_sessions', {
      id: `eq.${body.session_id}`,
      select: SESSION_SELECT,
      tenant_id: `in.(${tenantFilter})`,
    });

    if (!session) {
      throw new HttpError('VALIDATION', 'Conversation not found.', 404);
    }

    const role = membershipByTenant.get(session.tenant_id);

    if (role !== 'superadmin' && role !== 'tenant_admin' && role !== 'tenant_staff') {
      throw new HttpError('VALIDATION', 'Not allowed for this tenant.', 403);
    }

    // Toggle who owns the conversation. Taking over (human) silences the AI; the
    // LINE webhook checks agent_mode and stops replying for human-handled sessions.
    if (body.action === 'set_mode') {
      if (!body.agent_mode) {
        throw new HttpError('VALIDATION', 'agent_mode is required.', 400);
      }

      const rows = await updateRows<ChatSessionRow>('chat_sessions', {
        agent_mode: body.agent_mode,
      }, {
        id: `eq.${session.id}`,
        select: 'id,agent_mode',
        tenant_id: `eq.${session.tenant_id}`,
      });

      return json({ session: rows[0] ?? null });
    }

    // Manual reply from a human agent.
    const text = body.text?.trim();

    if (!text) {
      throw new HttpError('VALIDATION', 'text is required to send a reply.', 400);
    }

    const customer = embeddedOne(session.customers);
    const tenant = embeddedOne(session.tenants);

    if (!customer?.line_user_id || !tenant?.slug) {
      throw new HttpError('VALIDATION', 'This conversation has no LINE recipient.', 400);
    }

    await pushLineMessages(tenant.slug, customer.line_user_id, [textLineMessage(text)]);

    const message = await insertRow<ChatMessageRow>('chat_messages', {
      content: text,
      role: 'assistant',
      session_id: session.id,
    }, {
      select: 'id,session_id,role,content,created_at',
    });

    // Sending by hand takes the conversation over, and bump last_message_at so the
    // console inbox re-sorts this thread to the top.
    await updateRows<ChatSessionRow>('chat_sessions', {
      agent_mode: 'human',
      last_message_at: new Date().toISOString(),
    }, {
      id: `eq.${session.id}`,
      select: 'id',
      tenant_id: `eq.${session.tenant_id}`,
    });

    return json({ message });
  } catch (error) {
    return toErrorResponse(error);
  }
});
