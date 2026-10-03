import { describe, expect, test } from '@rstest/core';
import { UnknownFormatNaming } from './unknown-format-naming';

describe('UnknownFormatNaming', () => {
    test('converts kebab-case to class and variable names', () => {
        const naming = new UnknownFormatNaming('place-order');

        expect(naming.ClassName).toBe('PlaceOrder');
        expect(naming.variableName).toBe('placeOrder');
        expect(naming.fileName).toBe('place-order');
        expect(naming.withSpaces).toBe('place order');
    });

    test('accepts an empty name', () => {
        const naming = new UnknownFormatNaming('');

        expect(naming.ClassName).toBe('');
        expect(naming.variableName).toBe('');
    });

    test('ignores repeated, leading and trailing hyphens', () => {
        const naming = new UnknownFormatNaming('-place--order-');

        expect(naming.ClassName).toBe('PlaceOrder');
        expect(naming.variableName).toBe('placeOrder');
    });
});
