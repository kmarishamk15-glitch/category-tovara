const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const CODE_VERSION = "2.4.0";

console.log("=".repeat(50));
console.log(`Starting server v${CODE_VERSION}`);
console.log(`PORT: ${PORT}`);
console.log(`AMO_SUBDOMAIN: ${process.env.AMO_SUBDOMAIN || "NOT SET"}`);
console.log(`AMO_ACCESS_TOKEN: ${process.env.AMO_ACCESS_TOKEN ? "SET (length: " + process.env.AMO_ACCESS_TOKEN.length + ")" : "NOT SET"}`);
console.log("=".repeat(50));

// категории
const CATEGORY_A  = 974775;
const CATEGORY_B  = 974777;
const CATEGORY_C  = 974779;
const CATEGORY_BU = 974781;

// поля amoCRM
const FIELD_TYPE     = 466253;
const FIELD_MODEL    = 577689;
const FIELD_CATEGORY = 575965;

const TYPE_NEW = 931809;
const TYPE_BU  = 938373;

const accessories = [975967, 975969, 975971, 976049, 976051, 976053, 976055];
const hardware    = [975973, 975975, 975977, 975981, 975983, 980173];
const smartphones = [
  975979, 976893, 975985, 975987, 975989, 975991,
  975993, 975995, 975997, 975999, 976001, 976003,
  976005, 976007, 976009, 976011, 976013, 976015,
  976017, 976019, 976021, 976023, 976025, 976027,
  976029, 976031, 976033, 976035, 976037, 976039,
  976041, 976043, 976045, 976047, 976887, 976889,
  976891, 977077, 978049, 978051, 978053, 978055,
  979183, 981729, 981731, 981733, 981735, 982255
];

function calcCategory(type, model) {
  if (type === TYPE_BU) return CATEGORY_BU;
  if (type === TYPE_NEW) {
    if (accessories.includes(model)) return CATEGORY_B;
    if (hardware.includes(model))    return CATEGORY_C;
    return CATEGORY_A;
  }
  return null;
}

app.get("/", (req, res) => {
  res.send(`OK v${CODE_VERSION}`);
});

app.get("/webhook", (req, res) => {
  console.log("=== Verification GET webhook ===");
  return res.sendStatus(200);
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("=== Webhook POST received ===");
    console.log(`Code version: ${CODE_VERSION}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    if (!req.body || Object.keys(req.body).length === 0) {
      console.log("Empty body — verification webhook");
      return res.sendStatus(200);
    }

    const lead = req.body?.leads?.update?.[0] || req.body?.leads?.add?.[0];
    if (!lead || !lead.id) {
      console.log("Lead not found in payload");
      return res.sendStatus(200);
    }

    const leadId = lead.id;
    console.log(`Processing lead #${leadId}`);

    const subdomain = process.env.AMO_SUBDOMAIN || req.body?.account?.subdomain;
    const token = process.env.AMO_ACCESS_TOKEN;

    console.log(`Subdomain: ${subdomain || "NOT FOUND"}`);
    console.log(`Token: ${token ? "PRESENT" : "MISSING"}`);

    if (!subdomain) {
      console.log("❌ No subdomain found");
      return res.sendStatus(200);
    }

    if (!token) {
      console.log("❌ Missing AMO_ACCESS_TOKEN");
      return res.sendStatus(200);
    }

    // Получаем полную сделку с кастомными полями
    const url = `https://${subdomain}.amocrm.ru/api/v4/leads/${leadId}`;
    console.log(`Fetching lead from: ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      params: {
        with: "custom_fields_values"
      }
    });

    const fullLead = response.data;
    const custom = fullLead.custom_fields_values || [];

    console.log(`Custom fields count: ${custom.length}`);

    // Логируем все поля
    custom.forEach(f => {
      console.log(`  field_id=${f.field_id} | name="${f.field_name}" | values=${JSON.stringify(f.values)}`);
    });

    let type     = null;
    let model    = null;
    let category = null;

    // Берём enum_id для полей-списков
    custom.forEach(f => {
      if (f.field_id === FIELD_TYPE && f.values?.[0]) {
        type = f.values[0].enum_id || Number(f.values[0].value);
      }
      if (f.field_id === FIELD_MODEL && f.values?.[0]) {
        model = f.values[0].enum_id || Number(f.values[0].value);
      }
      if (f.field_id === FIELD_CATEGORY && f.values?.[0]) {
        category = f.values[0].enum_id || Number(f.values[0].value);
      }
    });

    console.log(`Parsed → type=${type} | model=${model} | category=${category}`);

    const correct = calcCategory(type, model);

    if (correct === null) {
      console.log("No matching rule — skipping");
      return res.sendStatus(200);
    }

    if (correct === category) {
      console.log(`✅ Category already correct (${correct})`);
      return res.sendStatus(200);
    }

    console.log(`🔄 Updating category: ${category} → ${correct}`);

    // 🔥 ИСПРАВЛЕНИЕ: для полей-списков используем enum_id
    await axios.patch(
      url,
      {
        custom_fields_values: [
          {
            field_id: FIELD_CATEGORY,
            values: [{ enum_id: correct }]  // ✅ enum_id вместо value
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Lead #${leadId} updated successfully`);
    return res.sendStatus(200);

  } catch (e) {
    console.log("❌ ERROR:", e.response?.data || e.message || e);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
