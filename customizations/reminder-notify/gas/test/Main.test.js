// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/16        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : Main.jsのユニットテスト(Main.test.js)
//     Description : isAlignedMinute(副作用を持たない純粋関数)を検証する。
//                   トリガー自体は1分間隔で発火するが、この関数がtrueを返す分
//                   (00分/05分/10分...)でだけ実際の処理を行うことで、
//                   setupTriggerを実行した時刻に関わらず送信予定時刻を
//                   キリの良い時刻に揃えている。
// ======================================================================

import { describe, expect, it } from 'vitest';
import Main from '../src/Main.js';

const { isAlignedMinute } = Main;

describe('isAlignedMinute', () => {
    it('5分間隔の場合、00分/05分/10分...のときだけtrueを返す', () => {
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 0), 5)).toBe(true);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 5), 5)).toBe(true);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 10), 5)).toBe(true);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 45), 5)).toBe(true);
    });

    it('5分間隔の場合、キリの良い時刻以外はfalseを返す', () => {
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 4), 5)).toBe(false);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 9), 5)).toBe(false);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 31), 5)).toBe(false);
    });

    it('10分間隔の場合、00分/10分/20分...のときだけtrueを返す', () => {
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 20), 10)).toBe(true);
        expect(isAlignedMinute(new Date(2026, 8, 16, 12, 5), 10)).toBe(false);
    });

    it('1分間隔の場合、常にtrueを返す', () => {
        for (let minute = 0; minute < 60; minute++) {
            expect(isAlignedMinute(new Date(2026, 8, 16, 12, minute), 1)).toBe(true);
        }
    });
});
