const express = require("express");
const axios = require("axios");

const app = express();
app.get("/", (req, res) => {
  res.send("OK");
});
app.use(express.json());

const PORT = process.env.PORT || 3000;

// категории
const CATEGORY_A = 974775;
const CATEGORY_B = 974777;
const CATEGORY_C = 974779;
const CATEGORY_BU = 974781;

// поля amoCRM
const FIELD_TYPE = 466253;
const FIELD_MODEL = 577689;
const FIELD_CATEGORY = 575965;

// -------- правила --------

const accessories = [975967,975969,975971,976049,976051,976053,976055];

const hardware = [975973,975975,975977,975981,975983,980173];

const smartphones = [
  975979,976893,
  975985,975987,975989,975991,
  975993,975995,975997,975999,
  976001,976003,976005,976007,
  976009,976011,976013,976015,
  976017,976019,976021,976023,
  976025,976027,976029,976031,
  976033,976035,976037,976039,
  976041,976043,976045,976047,
  976887,976889,976891,977077,
  978049,978051,978053,978055,
  979183,981729,981731,981733,
  981735,982255
];

// -------- вычисление категории --------

function calc(type, model) {

  if (type === 938373) {
    return CATEGORY_BU;
  }

  if (type === 931809) {

    if (accessories.includes(model)) return CATEGORY_B;
    if (hardware.includes(model)) return CATEGORY_C;
    if (smartphones.includes(model)) return CATEGORY_A;
  }

  return null;
}

// -------- webhook amoCRM --------

app.post("/webhook", async (req, res) => {

  try {
    const lead = req.body?.leads?.update?.[0];

    if (!lead) return res.sendStatus(200);

    const leadId = lead.id;

    const custom = lead.custom_fields_values || [];

    let type = null;
    let model = null;
    let category = null;

    custom.forEach(f => {
      if (f.field_id === FIELD_TYPE) type = f.values[0].value;
      if (f.field_id === FIELD_MODEL) model = f.values[0].value;
      if (f.field_id === FIELD_CATEGORY) category = f.values[0].value;
    });

    const correct = calc(Number(type), Number(model));

    // если уже правильно — ничего не делаем
    if (!correct || correct == category) {
      return res.sendStatus(200);
    }

    // -------- обновление сделки --------

    const subdomain = process.env.AMO_SUBDOMAIN;
    const token = process.env.AMO_ACCESS_TOKEN;

    await axios.patch(
      `https://${subdomain}.amocrm.ru/api/v4/leads/${leadId}`,
      {
        custom_fields_values: [
          {
            field_id: FIELD_CATEGORY,
            values: [{ value: correct }]
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

    return res.sendStatus(200);

  } catch (e) {
    console.log(e.response?.data || e.message);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log("running on " + PORT);
});
