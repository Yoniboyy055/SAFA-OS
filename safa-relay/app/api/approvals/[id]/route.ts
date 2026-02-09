import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(params);

  if (!id) {
    return NextResponse.json(
      { error: "Missing id" },
      { status: 400 }
    );
  }

  // TODO: approval logic here

  return NextResponse.json({ ok: true });
}
