import test from "node:test";
import assert from "node:assert/strict";
import { chatAttachmentPath, ESTABLISHMENT_SELECT, ORDER_SELECT } from "../src/lib/data-access.ts";

test("shared projections exclude banking information and delivery secrets", () => {
  for (const column of ["cnpj", "pix_key", "banco_conta", "banco_documento", "banco_agencia"])
    assert.ok(!ESTABLISHMENT_SELECT.split(",").includes(column));
  assert.ok(!ORDER_SELECT.split(",").includes("codigo_entrega"));
});
test("chat image paths remain usable after an old signed URL expires", () => {
  assert.equal(
    chatAttachmentPath(
      "https://example.supabase.co/storage/v1/object/sign/chat-attachments/user/order/photo%20old.png?token=expired",
    ),
    "user/order/photo old.png",
  );
  assert.equal(
    chatAttachmentPath("user/order/client_store/photo.png"),
    "user/order/client_store/photo.png",
  );
});
test("invalid chat object paths do not become external image requests", () => {
  for (const value of [
    null,
    "https://unrelated.example/photo.png",
    "/root/file",
    "user/../private.png",
    "user//file",
  ])
    assert.equal(chatAttachmentPath(value), null);
});
