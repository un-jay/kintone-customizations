// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : kintone REST APIクライアント(KintoneClient.js)
//     Description : UrlFetchAppによるkintone REST API呼び出しのみを行う。
//                   メール送信・業務ロジックはReminderService.jsに委譲する。
// ======================================================================

'use strict';

/**
 * @param {Object} config - loadConfig()の戻り値
 * @returns {string} kintoneのベースURL
 */
function buildBaseUrl(config) {
    return `https://${config.subdomain}.cybozu.com`;
}

/**
 * @param {Object} config
 * @returns {Object} 共通リクエストヘッダー
 */
function buildHeaders(config) {
    return {
        'X-Cybozu-API-Token': config.apiToken,
        'Content-Type': 'application/json',
    };
}

/**
 * 送信対象レコードを取得する。
 * 条件: (送信ステータス=未送信 かつ 送信予定日時<=現在時刻) または 即時送信要求あり。
 * 501件目以降は$id昇順のseek法で取得する(kintone REST APIの1回あたり取得上限が500件のため)。
 * @param {Object} config
 * @param {string} nowIso - 現在時刻(ISO 8601)
 * @returns {Array<Object>} 対象レコードの配列
 */
function fetchTargetRecords(config, nowIso) {
    const F = config.fields;
    const query =
        `(${F.SEND_STATUS} = "${STATUS.UNSENT}" and ${F.SCHEDULED_AT} <= "${nowIso}") ` +
        `or ${F.SEND_REQUEST} in ("${SEND_REQUEST_VALUE}")`;

    const records = [];
    let lastId = 0;

    for (;;) {
        const seekQuery = `${query} and $id > ${lastId} order by $id asc limit ${RECORDS_PER_REQUEST}`;
        const url =
            `${buildBaseUrl(config)}/k/v1/records.json` +
            `?app=${encodeURIComponent(config.appId)}&query=${encodeURIComponent(seekQuery)}`;

        const response = UrlFetchApp.fetch(url, {
            method: 'get',
            headers: buildHeaders(config),
            muteHttpExceptions: true,
        });

        if (response.getResponseCode() !== 200) {
            throw new Error(`レコード取得に失敗しました: ${response.getContentText()}`);
        }

        const body = JSON.parse(response.getContentText());
        records.push(...body.records);

        if (body.records.length < RECORDS_PER_REQUEST) {
            break;
        }
        lastId = body.records[body.records.length - 1].$id.value;
    }

    return records;
}

/**
 * 1件のレコードを更新する。
 * @param {Object} config
 * @param {string|number} recordId
 * @param {string}        revision
 * @param {Object}        fieldValues - { フィールドコード: 値 } の形式(kintoneの{value:...}形式ではない)
 */
function updateRecord(config, recordId, revision, fieldValues) {
    const record = {};
    Object.entries(fieldValues).forEach(([fieldCode, value]) => {
        record[fieldCode] = { value };
    });

    const response = UrlFetchApp.fetch(`${buildBaseUrl(config)}/k/v1/record.json`, {
        method: 'put',
        headers: buildHeaders(config),
        muteHttpExceptions: true,
        payload: JSON.stringify({
            app: config.appId,
            id: recordId,
            revision,
            record,
        }),
    });

    if (response.getResponseCode() !== 200) {
        throw new Error(
            `レコード更新に失敗しました(id=${recordId}): ${response.getContentText()}`,
        );
    }
}
