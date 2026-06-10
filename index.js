require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/*
========================================
🔧 ПРАВИЛА ПЕРЕХОДОВ
========================================

Логика:

ЕСЛИ сделка перенесена:

ИЗ:
- определенной воронки
- определенного этапа

В:
- определенную воронку
- один из определенных этапов

ТО:
→ меняем ответственного
на того, кто передвинул сделку

========================================
КАК ДОБАВЛЯТЬ ПРАВИЛА
========================================

{
    from: {
        pipeline: ID_ВОРОНКИ_ИЗ,
        status: ID_ЭТАПА_ИЗ
    },

    to: {
        pipeline: ID_ВОРОНКИ_КУДА,
        status: [
            ID_ЭТАПА_1,
            ID_ЭТАПА_2
        ]
    }
}

*/

const RULES = [

    /*
    ========================================
    ИЗ:
    Воронка 5240944
    Этап 47069740

    В:
    Воронка 5276629
    Несколько этапов
    ========================================
    */

    {
        from: {
            pipeline: 5240944,
            status: 47069740
        },

        to: {
            pipeline: 5276629,
            status: [
                47054479,
                53410254,
                53780378,
                53410258,
                143,
                142
            ]
        }
    },

    /*
    ========================================
    ИЗ:
    Воронка 5240944
    Этап 47069740

    В:
    Воронка 5240944
    Этап 143
    ========================================
    */

    {
        from: {
            pipeline: 5240944,
            status: 47069740
        },

        to: {
            pipeline: 5240944,
            status: [
                143
            ]
        }
    }

];
const SKIP_DATE_CHANGE = {
    typeField: 466253,
    typeValue: 978137,
    reasonField: 573457,
    reasonValue: 976779
};
/*
========================================
🚫 ИСКЛЮЧЕНИЯ ДЛЯ СМЕНЫ ДАТЫ
========================================

Если в сделке установлены:
- Поле 466253 (Тип запроса) = 978137 (нецелевой/техника)
- Поле 573457 (Причина отказа) = 976779 (нецелевой ндз>3)

ТО:
→ меняем ТОЛЬКО ответственного
→ дату НЕ меняем

*/

const SKIP_DATE_CHANGE = {
    typeField: 466253,
    typeValue: 978137,
    reasonField: 573457,
    reasonValue: 976779
};

/*
========================================
🌐 Проверка работы
========================================
*/

app.get('/webhook', (req, res) => {

    res.status(200).send('Webhook works');

});

app.get('/', (req, res) => {

    res.status(200).send('AmoCRM Bot is running');

});

/*
========================================
📥 WEBHOOK
========================================
*/

app.post('/webhook', async (req, res) => {

    try {

        console.log('======================');
        console.log('📥 NEW WEBHOOK');
        console.log('======================');

        console.log(JSON.stringify(req.body, null, 2));

        /*
        Берем ТОЛЬКО событие смены этапа
        */

        const lead = req.body.leads?.status?.[0];

        /*
        Не смена этапа?
        Игнорируем
        */

        if (!lead) {

            console.log('⏭️ Not a status event');

            return res.sendStatus(200);
        }

        /*
        Данные сделки
        */

        const leadId = Number(lead.id);

        const pipelineId = Number(lead.pipeline_id);

        const newStatusId = Number(lead.status_id);

        const oldStatusId = Number(lead.old_status_id);

        /*
        Иногда amoCRM не присылает old_pipeline_id.
        Поэтому можно указать fallback.
        */

        const oldPipelineId = Number(
            lead.old_pipeline_id || 5240944
        );

        /*
        Кто передвинул сделку
        */

        const userId = Number(
            lead.modified_user_id ||
            lead.modified_by ||
            lead.updated_by
        );

        /*
        Текущий ответственный
        */

        const currentResponsible = Number(
            lead.responsible_user_id
        );

        console.log('Lead ID:', leadId);
        console.log('Old Pipeline:', oldPipelineId);
        console.log('Old Status:', oldStatusId);
        console.log('New Pipeline:', pipelineId);
        console.log('New Status:', newStatusId);
        console.log('User ID:', userId);

        /*
        Проверяем:
        этап реально изменился?
        */

        if (!oldStatusId) {

            console.log('⏭️ No old status');

            return res.sendStatus(200);
        }

        if (oldStatusId === newStatusId) {

            console.log('⏭️ Same status');

            return res.sendStatus(200);
        }

        /*
        Ищем подходящее правило
        */

        const matchedRule = RULES.find(rule => {

            const fromMatches =
                rule.from.pipeline === oldPipelineId &&
                rule.from.status === oldStatusId;

            const toMatches =
                rule.to.pipeline === pipelineId &&
                rule.to.status.includes(newStatusId);

            return fromMatches && toMatches;

        });

        /*
        Нет подходящего правила
        */

        if (!matchedRule) {

            console.log('⏭️ No matching rule');

            return res.sendStatus(200);
        }

        /*
        Нет пользователя?
        */

        if (!userId) {

            console.log('⏭️ No user ID');

            return res.sendStatus(200);
        }

        /*
        Уже нужный ответственный?
        */

        if (currentResponsible === userId) {

            console.log('⏭️ Responsible already correct');

            return res.sendStatus(200);
        }

        /*
        Меняем ответственного
        */

        console.log(
            `✅ Updating responsible: ${currentResponsible} → ${userId}`
        );

        await axios.patch(
            `https://${process.env.AMO_DOMAIN}/api/v4/leads/${leadId}`,
            {
                responsible_user_id: userId
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.AMO_TOKEN}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            }
        );

        console.log('✅ Responsible updated');

        /*
        ПРОВЕРЯЕМ: нужно ли менять дату?
        
        Если в сделке установлены:
        - Поле 466253 (Тип запроса) = 978137 (нецелевой/техника)
        - Поле 573457 (Причина отказа) = 976779 (нецелевой ндз>3)
        
        ТО дату НЕ меняем
        */

        let skipDateChange = false;

        try {

            const leadResponse = await axios.get(
                `https://${process.env.AMO_DOMAIN}/api/v4/leads/${leadId}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.AMO_TOKEN}`,
                        Accept: 'application/json'
                    },
                    params: {
                        with: 'custom_fields_values'
                    }
                }
            );

            const customFields = leadResponse.data.custom_fields_values || [];

            let typeValue = null;
            let reasonValue = null;

            for (const field of customFields) {

                if (field.field_id === SKIP_DATE_CHANGE.typeField) {
                    typeValue = field.values?.[0]?.enum_id;
                }

                if (field.field_id === SKIP_DATE_CHANGE.reasonField) {
                    reasonValue = field.values?.[0]?.enum_id;
                }
            }

            console.log('Type field value:', typeValue);
            console.log('Reason field value:', reasonValue);

            if (
                typeValue === SKIP_DATE_CHANGE.typeValue &&
                reasonValue === SKIP_DATE_CHANGE.reasonValue
            ) {
                skipDateChange = true;
                console.log('⏭️ Skip date change: non-target lead');
            }

        } catch (error) {

            console.log('⚠️ Error fetching lead fields:', error.message);
            console.log('⚠️ Will update date anyway');
        }

        /*
        МЕНЯЕМ ДАТУ СОЗДАНИЯ СДЕЛКИ НА СЕГОДНЯ
        (если не исключение)
        */

        if (!skipDateChange) {

            const now = Math.floor(Date.now() / 1000); // Текущая дата в Unix timestamp

            await axios.patch(
                `https://${process.env.AMO_DOMAIN}/api/v4/leads/${leadId}`,
                {
                    created_at: now
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.AMO_TOKEN}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    }
                }
            );

            console.log('✅ Creation date updated to today');

        } else {

            console.log('⏭️ Date not changed (exception)');
        }

        return res.sendStatus(200);

    } catch (error) {

        console.log('❌ ERROR');

        if (error.response) {

            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);

        } else {

            console.log(error.message);

        }

        return res.sendStatus(500);
    }
});

/*
========================================
🚀 СТАРТ СЕРВЕРА
========================================
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`🚀 Server started on port ${PORT}`);

});
