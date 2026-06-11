import { chatRequestSchema, orchestrateChat } from '../_shared/orchestrate.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson } from '../_shared/http.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    const body = await validateJson(req, chatRequestSchema);
    const result = await orchestrateChat(body, req.headers.get('authorization'));

    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
});
