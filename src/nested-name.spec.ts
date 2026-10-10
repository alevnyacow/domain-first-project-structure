import { describe, expect, test } from '@rstest/core';
import { NestedName } from './nested-name';

describe('NestedName', () => {
    test('splits folders from the name', () => {
        const name = new NestedName('admin/panel/users');

        expect(name.folders).toEqual(['admin', 'panel']);
        expect(name.fileName).toBe('users');
        expect(name.ClassName).toBe('AdminPanelUsers');
        expect(name.classNameSegments).toEqual(['Admin', 'Panel', 'Users']);
    });

    test('accepts a name without folders', () => {
        const name = new NestedName('user-list');

        expect(name.folders).toEqual([]);
        expect(name.ClassName).toBe('UserList');
    });

    test('ignores empty segments, spaces and backslashes', () => {
        const name = new NestedName(' /admin// panel\\users/ ');

        expect(name.folders).toEqual(['admin', 'panel']);
        expect(name.fileName).toBe('users');
    });

    test('converts kebab-case segments', () => {
        const name = new NestedName('admin-area/user-list');

        expect(name.fileName).toBe('user-list');
        expect(name.ClassName).toBe('AdminAreaUserList');
    });

    test('rejects empty names and dot segments', () => {
        expect(NestedName.validate(' / ')).not.toBe(true);
        expect(NestedName.validate('../users')).not.toBe(true);
        expect(NestedName.validate('admin/./users')).not.toBe(true);
        expect(NestedName.validate('admin/users')).toBe(true);
    });
});
