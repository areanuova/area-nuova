export const prerender = false;

export function GET(): Response {
  return Response.json({
    ok: true,
    service: 'Aris',
    timestamp: new Date().toISOString(),
  });
}
