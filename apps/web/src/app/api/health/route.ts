export async function GET() {
  return Response.json({
    ok: true,
    service: "hmw-web",
    time: new Date().toISOString(),
  });
}
