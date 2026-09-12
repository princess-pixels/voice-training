import { describe, expect, test } from 'bun:test';
import { CATEGORY_ORDER, categoryBadgeClass, categoryFillClass, categoryLabel } from './categories';

describe('categories', () => {
	test('every ordered category has a label, a badge and a fill', () => {
		for (const category of CATEGORY_ORDER) {
			expect(categoryLabel(category)).not.toBe(category === 'sovt' ? 'Sovt' : '');
			expect(categoryBadgeClass(category)).toContain('text-');
			expect(categoryFillClass(category)).toMatch(/^bg-/);
		}
	});

	test('sovt is spelled out rather than capitalised', () => {
		expect(categoryLabel('sovt')).toBe('Straw / SOVT');
	});

	test('unknown categories fall back to neutral styling and their own name', () => {
		expect(categoryLabel('mystery')).toBe('mystery');
		expect(categoryBadgeClass('mystery')).toContain('surface');
		expect(categoryFillClass('mystery')).toBe('bg-surface-500');
	});
});
