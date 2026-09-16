// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/13        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/16        J.Yamamoto      :pickStuckProcessingRowsのテストを追加
// ----------------------------------------------------------------------
//     ModuleName  : ReminderService.jsのユニットテスト(ReminderService.test.js)
//     Description : pickDueScheduleRows/buildMailRecordView/pickStuckProcessingRows
//                   (いずれも副作用を持たない純粋関数)を検証する。
// ======================================================================

import { describe, expect, it } from 'vitest';
import ReminderService from '../src/ReminderService.js';

const { pickDueScheduleRows, buildMailRecordView, pickStuckProcessingRows } =
    ReminderService;

const FIELDS = {
    SEND_STATUS: 'SEND_STATUS',
    SCHEDULED_AT: 'SCHEDULED_SEND_AT',
    SEND_REQUEST: 'SEND_REQUEST',
    DAYS_BEFORE: 'DAYS_BEFORE',
    SEND_TIME: 'SEND_TIME',
};

const NOW_ISO = '2026-09-13T00:00:00Z';

function scheduleRow({ id, status, scheduledAt, sendRequest }) {
    return {
        id,
        value: {
            SEND_STATUS: { value: status },
            SCHEDULED_SEND_AT: { value: scheduledAt },
            SEND_REQUEST: { value: sendRequest || [] },
        },
    };
}

describe('pickDueScheduleRows', () => {
    it('未送信 かつ 送信予定日時が現在時刻以前の行を抽出する', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '未送信',
                scheduledAt: '2026-09-12T00:00:00Z',
            }),
            scheduleRow({
                id: '2',
                status: '未送信',
                scheduledAt: '2026-09-14T00:00:00Z',
            }),
        ];
        const result = pickDueScheduleRows(rows, FIELDS, '未送信', '即時送信', NOW_ISO);
        expect(result.map((row) => row.id)).toEqual(['1']);
    });

    it('未送信 かつ 即時送信要求ありの行は、送信予定日時が未来でも抽出する', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '未送信',
                scheduledAt: '2099-01-01T00:00:00Z',
                sendRequest: ['即時送信'],
            }),
        ];
        const result = pickDueScheduleRows(rows, FIELDS, '未送信', '即時送信', NOW_ISO);
        expect(result.map((row) => row.id)).toEqual(['1']);
    });

    it('送信済み・エラー等、未送信でない行は対象外にする', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '送信済み',
                scheduledAt: '2026-09-01T00:00:00Z',
            }),
            scheduleRow({
                id: '2',
                status: 'エラー',
                scheduledAt: '2026-09-01T00:00:00Z',
                sendRequest: ['即時送信'],
            }),
        ];
        expect(pickDueScheduleRows(rows, FIELDS, '未送信', '即時送信', NOW_ISO)).toEqual(
            [],
        );
    });

    it('未送信でも、送信予定日時が未来かつ即時送信要求も無ければ対象外にする', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '未送信',
                scheduledAt: '2099-01-01T00:00:00Z',
            }),
        ];
        expect(pickDueScheduleRows(rows, FIELDS, '未送信', '即時送信', NOW_ISO)).toEqual(
            [],
        );
    });

    it('行が未定義の場合は空配列を返す', () => {
        expect(
            pickDueScheduleRows(undefined, FIELDS, '未送信', '即時送信', NOW_ISO),
        ).toEqual([]);
    });
});

describe('pickStuckProcessingRows', () => {
    it('送信処理中の行を抽出する(前回以前の実行が中断され残っていると推定される行)', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '未送信',
                scheduledAt: '2026-09-12T00:00:00Z',
            }),
            scheduleRow({
                id: '2',
                status: '送信処理中',
                scheduledAt: '2026-09-12T00:00:00Z',
            }),
        ];
        const result = pickStuckProcessingRows(rows, FIELDS, '送信処理中');
        expect(result.map((row) => row.id)).toEqual(['2']);
    });

    it('送信処理中の行が無ければ空配列を返す', () => {
        const rows = [
            scheduleRow({
                id: '1',
                status: '未送信',
                scheduledAt: '2026-09-12T00:00:00Z',
            }),
            scheduleRow({
                id: '2',
                status: '送信済み',
                scheduledAt: '2026-09-12T00:00:00Z',
            }),
        ];
        expect(pickStuckProcessingRows(rows, FIELDS, '送信処理中')).toEqual([]);
    });

    it('行が未定義の場合は空配列を返す', () => {
        expect(pickStuckProcessingRows(undefined, FIELDS, '送信処理中')).toEqual([]);
    });
});

describe('buildMailRecordView', () => {
    it('レコードの値と、対象行のDAYS_BEFORE/SEND_TIME/SCHEDULED_SEND_ATをマージする', () => {
        const record = {
            TITLE: { value: '定例会議' },
            DAYS_BEFORE: { value: '999' }, // レコード直下には無いはずの値(混同していないか確認用)
        };
        const row = scheduleRow({
            id: '1',
            status: '未送信',
            scheduledAt: '2026-09-12T00:00:00Z',
        });
        row.value.DAYS_BEFORE = { value: '3' };
        row.value.SEND_TIME = { value: '09:00' };

        const view = buildMailRecordView(record, row, FIELDS);

        expect(view.TITLE).toEqual({ value: '定例会議' });
        expect(view.DAYS_BEFORE).toEqual({ value: '3' });
        expect(view.SEND_TIME).toEqual({ value: '09:00' });
        expect(view.SCHEDULED_SEND_AT).toEqual({ value: '2026-09-12T00:00:00Z' });
    });
});
