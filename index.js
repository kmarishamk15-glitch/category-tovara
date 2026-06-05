const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// категории
const CATEGORY_A  = 974775;   // A. Смартфоны NEW—iPhone
const CATEGORY_B  = 974777;   // B. Ориг. Аксы NEW—AirPods / Watch
const CATEGORY_C  = 974779;   // C. Железо NEW — Mac / iPad / Dyson
const CATEGORY_BU = 974781;   // Б/У

// поля amoCRM
const FIELD_TYPE     = 466253;
const FIELD_MODEL    = 577689;
const FIELD_CATEGORY = 575965;

// типы запроса
const TYPE_NEW = 931809;   // Покупка новой техники
const TYPE_BU  = 938373;   // Покупка БУ техники

// списки моделей
const accessories = [
  975967, 975969, 975971, 976049, 976051, 976053, 976055
];

const hardware = [
  975973, 975975, 975977, 975981, 975983, 980173
];

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

// -------- вычисление категории --------
function calcCategory(type, model) {
  // БУ техника — всегда Б/У (974781)
  if (type === TYPE_BU) {
    return CATEGORY_BU;
  }

  // Новая техника
  if (type === TYPE_NEW) {
    if (accessories.includes(model)) return CATEGORY_B;
    if (hardware.includes(model))    return CATEGORY_C;
    // Все остальное (смартфоны и прочее) → A
    return CATEGORY_A;
  }

  return null;
}

// -------- роуты --------
app.get("/", (req, res) => {
  res.send("OK");
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("=== Webhook received ===");
    console.log(JSON.stringify(req.body, null, 2));

    // amoCRM может присылать данные в разных форматах — пробуем несколько
    const lead =
      req.body?.leads?.update?.[0] ||
      req.body?.leads?.add?.[0]    ||
      req.body;

    if (!lead || !lead.id) {
      console.log("Lead not found in payload");
      return res.sendStatus(200);
    }

    const leadId = lead.id;
    const custom = lead.custom_fields_values || [];

    let type = null;
    let model = null;
    let category = null;

    custom.forEach(f => {
      if (f.field_id === FIELD_TYPE     && f.values?.[0]) type     = Number(f.values[0].value);
      if (f.field_id === FIELD_MODEL    && f.values?.[0]) model    = Number(f.values[0].value);
      if (f.field_id === FIELD_CATEGORY && f.values?.[0]) category = Number(f.values[0].value);
    });

    console.log(`Lead #${leadId} | type=${type} | model=${model} | category=${category}`);

    const correct = calcCategory(type, model);

    if (correct === null) {
      console.log("No matching rule — skipping");
      return res.sendStatus(200);
    }

    if (correct === category) {
      console.log(`Category already correct (${correct}) — nothing to do`);
      return res.sendStatus(200);
    }

    console.log(`Updating category: ${category} → ${correct}`);

    const subdomain = process.env.AMO_SUBDOMAIN;
    const token     = process.env.AMO_ACCESS_TOKEN;

    if (!subdomain || !token) {
      console.log("Missing env vars: AMO_SUBDOMAIN or AMO_ACCESS_TOKEN");
      return res.sendStatus(200);
    }

    const url = `https://${subdomain}.amocrm.ru/api/v4/leads/${leadId}`;

    const payload = {
      custom_fields_values: [
        {
          field_id: FIELD_CATEGORY,
          values: [{ value: String(correct) }]
        }
      ]
    };

    const response = await axios.patch(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`Lead #${leadId} updated successfully`);
    console.log("amoCRM response:", response.status, response.data);

    return res.sendStatus(200);

  } catch (e) {
    console.log("ERROR:", e.response?.data || e.message || e);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
