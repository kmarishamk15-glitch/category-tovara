const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const CODE_VERSION = "2.5.0";

// категории
const CATEGORY_A  = 974775;
const CATEGORY_B  = 974777;
const CATEGORY_C  = 974779;
const CATEGORY_BU = 974781;

// поля amoCRM
const FIELD_TYPE     = 466253;
const FIELD_MODEL    = 577689;
const FIELD_CATEGORY = 575965;

// типы
const TYPE_NEW = 931809;
const TYPE_BU  = 938373;

// аксессуары / железо / смартфоны
const accessories = [975967,975969,975971,976049,976051,976053,976055];

const hardware = [975973,975975,975977,975981,975983,980173];

const smartphones = [
  975979,976893,975985,975987,975989,975991,
  975993,975995,975997,975999,976001,976003,
  976005,976007,976009,976011,976013,976015,
  976017,976019,976021,976023,976025,976027,
  976029,976031,976033,976035,976037,976039,
  976041,976043,976045,976047,976887,976889,
  976891,977077,978049,978051,978053,978055,
  979183,981729,981731,981733,981735,982255
];

function calcCategory(type, model) {
  if (type === TYPE_BU) return CATEGORY_BU;

  if (type === TYPE_NEW) {
    if (accessories.includes(model)) return CATEGORY_B;
    if (hardware.includes(model)) return CATEGORY_C;
    return CATEGORY_A;
  }

  return null;
}

app.get("/", (req, res) => {
  res.send("OK v" + CODE_VERSION);
});

app.post("/webhook", async (req, res) => {
  try {
    const lead = req.body?.leads?.update?.[0] || req.body?.leads?.add?.[0];

    if (!lead?.id) return res.sendStatus(200);

    const leadId = lead.id;

    const subdomain = process.env.AMO_SUBDOMAIN;
    const token = process.env.AMO_ACCESS_TOKEN;

    if (!subdomain || !token) return res.sendStatus(200);

    // получаем полные данные сделки
    const url = `https://${subdomain}.amocrm.ru/api/v4/leads/${leadId}`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { with: "custom_fields_values" }
    });

    const custom = response.data.custom_fields_values || [];

    let type = null;
    let model = null;
    let category = null;

    for (const f of custom) {
      const val = f.values?.[0];

      if (!val) continue;

      if (f.field_id === FIELD_TYPE) type = val.enum_id;
      if (f.field_id === FIELD_MODEL) model = val.enum_id;
      if (f.field_id === FIELD_CATEGORY) category = val.enum_id;
    }

    const correct = calcCategory(type, model);

    if (!correct) return res.sendStatus(200);

    if (correct === category) return res.sendStatus(200);

    console.log(`Updating ${category} → ${correct}`);

    // 🔥 ВАЖНО: правильный PATCH для amoCRM enum поля
    await axios.patch(url, {
      custom_fields_values: [
        {
          field_id: FIELD_CATEGORY,
          values: [
            {
              enum_id: correct
            }
          ]
        }
      ]
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    return res.sendStatus(200);

  } catch (e) {
    console.log("ERROR:", e.response?.data || e.message);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log("running on " + PORT);
});
