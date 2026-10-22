import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as details from "../src/lib/product-details.ts";
import { loadTsx } from "./helpers/load-tsx.mjs";

const hooks = loadTsx();
const { ProductSpecificFields } = await import("../src/components/product-specific-fields.tsx");
const { ProductDetails } = await import("../src/components/product-details.tsx");
test.after(() => hooks.deregister());
const fields = details.productFields("Bebidas / Refrigerantes");

test("litres accept comma or point and persist canonical millilitres without losing other attributes", () => {
  for (const amount of ["1,5", "1.5"]) {
    const raw = details.writeProductDetails(
      "Garrafa",
      {
        volume_ml: amount,
        volume_unit: "L",
        embalagem: "Garrafa",
        marca: "Marca teste",
        personalizado: "Manter",
      },
      fields,
    );
    assert.deepEqual(details.readProductDetails(raw).attributes, {
      volume_ml: "1500",
      volume_unit: "L",
      embalagem: "Garrafa",
      marca: "Marca teste",
      personalizado: "Manter",
    });
    assert.equal(details.productSnapshotName("Suco", raw), "Suco · 1,5 L");
    assert.match(details.productSummary(raw), /Volume: 1,5 L/);
    assert.equal(
      details.detailBadges(raw).some(({ key }) => key === "volume_unit"),
      false,
    );
    assert.match(renderToStaticMarkup(createElement(ProductDetails, { value: raw })), /1,5 L/);
  }
});

test("legacy millilitres retain their values and can be edited repeatedly without multiplying volume", () => {
  const legacy = "Refri\n\n[[extras:volume_ml=350;embalagem=Lata;personalizado=Manter]]";
  assert.equal(details.productSnapshotName("Refri", legacy), "Refri · 350 ml");
  const editor = details.readProductEditorDetails(legacy);
  assert.equal(editor.attributes.volume_ml, "350");
  const litreEditor = details.changeProductVolumeUnit(editor.attributes, "L");
  assert.equal(litreEditor.volume_ml, "0,35");
  const saved = details.writeProductDetails(legacy, litreEditor, fields);
  assert.equal(details.readProductDetails(saved).attributes.volume_ml, "350");
  assert.equal(details.readProductDetails(saved).attributes.personalizado, "Manter");
  assert.equal(details.readProductEditorDetails(saved).attributes.volume_ml, "0,35");
  const again = details.writeProductDetails(
    saved,
    details.readProductEditorDetails(saved).attributes,
    fields,
  );
  assert.equal(details.readProductDetails(again).attributes.volume_ml, "350");
  assert.equal(details.changeProductVolumeUnit(litreEditor, "ml").volume_ml, "350");
});

test("beverage editor offers ml and litres, defaults legacy values to ml and handles decimal input", () => {
  const form = renderToStaticMarkup(
    createElement(ProductSpecificFields, {
      fields,
      values: { volume_ml: "350" },
      onChange() {},
    }),
  );
  assert.match(form, /id="detail-volume_unit"/);
  assert.match(form, /<option value="ml" selected="">ml<\/option>/);
  assert.match(form, /<option value="L">L<\/option>/);
  assert.match(form, /inputMode="decimal"/);
  let changed;
  const rendered = ProductSpecificFields({
    fields,
    values: { volume_ml: "350", marca: "Manter" },
    onChange(values) {
      changed = values;
    },
  });
  const unitField = rendered.props.children[1].props.children.find(
    (field) => field.key === "volume_unit",
  );
  unitField.props.children[1].props.onChange({ target: { value: "L" } });
  assert.deepEqual(changed, { volume_ml: "0,35", volume_unit: "L", marca: "Manter" });
});

test("changing to another volume category keeps the selected litre label accurate", () => {
  const form = renderToStaticMarkup(
    createElement(ProductSpecificFields, {
      fields: details.productFields("Açaí"),
      values: { volume_ml: "1,5", volume_unit: "L" },
      onChange() {},
    }),
  );
  assert.match(form, /Volume \(L\)/);
  assert.doesNotMatch(form, /Volume \(ml\)/);
});

test("invalid beverage volume and unsupported units are rejected before serialization", () => {
  for (const volume_ml of ["0", "-1", "1e3", "NaN", "Infinity", "1,2.3", "1.2345678", "1 L"])
    assert.throws(
      () => details.writeProductDetails("", { volume_ml, volume_unit: "L" }, fields),
      /maior que zero/,
    );
  assert.throws(
    () => details.writeProductDetails("", { volume_ml: "1", volume_unit: "kg" }, fields),
    /unidade/i,
  );
  assert.equal(
    details.writeProductDetails("Sem volume", { volume_ml: "", volume_unit: "L" }, fields),
    "Sem volume",
  );
  assert.equal(
    details.readProductDetails(
      details.writeProductDetails("", { volume_ml: "0,001", volume_unit: "L" }, fields),
    ).attributes.volume_ml,
    "1",
  );
});
