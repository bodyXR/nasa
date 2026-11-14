import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Firestore Security Rules & Blueprint Integrity', () => {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
  const blueprint = JSON.parse(readFileSync(join(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

  it('enforces default-deny catch-all and strict verified ownership', () => {
    expect(rules).toContain("rules_version = '2';");
    expect(rules).toContain('match /{document=**}');
    expect(rules).toContain('allow read, write: if false;');
    expect(rules).toContain('request.auth.token.email_verified == true');
    expect(rules).toContain('request.auth.uid == userId');
    expect(rules).toContain('allow list: if false;');
    expect(rules).toContain('request.query.limit != null && request.query.limit <= 100');
  });

  it('enforces strict key whitelists, immutable ownership, and server timestamps', () => {
    expect(rules).toContain('hasAll([');
    expect(rules).toContain('hasOnly([');
    expect(rules).toContain('affectedKeys().hasOnly([');
    expect(rules).toContain('request.time');
    expect(rules).toContain('isValidId(');
  });

  it('stays synchronized with firebase-blueprint.json entities and paths', () => {
    expect(Object.keys(blueprint.entities)).toEqual([
      'UserProfile',
      'SavedRoutePlan',
      'TargetBookmark',
    ]);
    expect(Object.keys(blueprint.firestore)).toEqual([
      '/users/{userId}',
      '/users/{userId}/routePlans/{planId}',
      '/users/{userId}/targetBookmarks/{bookmarkId}',
    ]);
  });
});
