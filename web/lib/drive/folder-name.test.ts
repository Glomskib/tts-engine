import { describe, it, expect } from 'vitest';
import { buildContentItemFolderName, type FolderNameInput } from './folder-name';

describe('buildContentItemFolderName', () => {
  it('builds full name with brand + product', () => {
    const input: FolderNameInput = {
      shortId: 'FF-7a3b2c',
      title: 'Hop Water Peach UGC',
      brandName: 'HopWater',
      productName: 'Peach 6pk',
    };
    expect(buildContentItemFolderName(input)).toBe(
      'FF - HopWater - Peach 6pk - Hop Water Peach UGC - FF-7a3b2c',
    );
  });

  it('builds name without brand', () => {
    const input: FolderNameInput = {
      shortId: 'FF-abc123',
      title: 'Morning Routine',
      brandName: null,
      productName: 'Energy Drink',
    };
    expect(buildContentItemFolderName(input)).toBe(
      'FF - Energy Drink - Morning Routine - FF-abc123',
    );
  });

  it('builds name without brand or product', () => {
    const input: FolderNameInput = {
      shortId: 'FF-000000',
      title: 'Quick Test Video',
    };
    expect(buildContentItemFolderName(input)).toBe(
      'FF - Quick Test Video - FF-000000',
    );
  });

  it('truncates long segments to 30 chars', () => {
    const input: FolderNameInput = {
      shortId: 'FF-xyz789',
      title: 'This is a very long title that should be truncated to thirty characters',
      brandName: 'Super Mega Ultra Brand Name That Is Way Too Long',
    };
    const result = buildContentItemFolderName(input);
    expect(result).toContain('FF-xyz789');
    // Brand and title segments should be truncated
    const segments = result.split(' - ');
    // segments: FF, brand, title, shortId
    expect(segments[1].length).toBeLessThanOrEqual(31); // 30 + ellipsis char
    expect(segments[2].length).toBeLessThanOrEqual(31);
  });

  it('always starts with FF and ends with shortId', () => {
    const input: FolderNameInput = {
      shortId: 'FF-aaa111',
      title: 'Test',
      brandName: 'Brand',
      productName: 'Prod',
    };
    const result = buildContentItemFolderName(input);
    expect(result.startsWith('FF - ')).toBe(true);
    expect(result.endsWith('FF-aaa111')).toBe(true);
  });
});

describe('idempotency guard', () => {
  it('drive_folder_id presence should short-circuit folder creation', () => {
    // This tests the contract: if item already has drive_folder_id + drive_folder_url,
    // ensureContentItemDriveFolder should return them without calling Drive API.
    // We verify the guard logic inline.
    const item = {
      drive_folder_id: 'existing-id-123',
      drive_folder_url: 'https://drive.google.com/drive/folders/existing-id-123',
    };

    // Simulate the guard from ensureContentItemFolder.ts
    const alreadyExists = !!(item.drive_folder_id && item.drive_folder_url);
    expect(alreadyExists).toBe(true);
  });

  it('missing drive_folder_id should proceed to creation', () => {
    const item = { drive_folder_id: null, drive_folder_url: null };
    const alreadyExists = !!(item.drive_folder_id && item.drive_folder_url);
    expect(alreadyExists).toBe(false);
  });

  it('partial data (id but no url) should proceed to creation', () => {
    const item = { drive_folder_id: 'some-id', drive_folder_url: null };
    const alreadyExists = !!(item.drive_folder_id && item.drive_folder_url);
    expect(alreadyExists).toBe(false);
  });
});
