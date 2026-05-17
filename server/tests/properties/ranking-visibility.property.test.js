import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { initDatabase } from '../../db/init.js';
import { createRankingService } from '../../services/rankingService.js';
import { createRankingModel } from '../../models/rankingModel.js';
import { createUserModel } from '../../models/userModel.js';
import { createTreeModel } from '../../models/treeModel.js';

/**
 * Feature: tree-growing-game, Property 9: 排行榜可见性一致性
 *
 * For any set of users and their participation states,
 * the ranking list should contain exactly all users with participate=true
 * and should not contain any user with participate=false.
 * Toggling participation should be immediately reflected in the ranking.
 *
 * **Validates: Requirements 9.1, 9.2, 9.5**
 */
describe('Property 9: 排行榜可见性一致性', () => {
  let db;
  let rankingService;
  let rankingModel;
  let userModel;
  let treeModel;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const getDatabase = () => db;
    rankingService = createRankingService({ getDatabase });
    rankingModel = createRankingModel({ getDatabase });
    userModel = createUserModel({ getDatabase });
    treeModel = createTreeModel({ getDatabase });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Arbitrary: generate a list of 2-10 users, each with a random participation state.
   */
  const usersArb = fc.array(
    fc.record({
      participate: fc.boolean(),
      species: fc.constantFrom('apple', 'cherry', 'oak'),
    }),
    { minLength: 2, maxLength: 10 }
  );

  it('should include exactly all participating users and exclude non-participating users', () => {
    fc.assert(
      fc.property(
        usersArb,
        (usersConfig) => {
          // Create users with trees and set participation
          const createdUsers = usersConfig.map((config, index) => {
            const user = userModel.create({
              openid: `ranking-test-${Date.now()}-${Math.random()}-${index}`,
              nickname: `User${index}`,
              water_count: 50,
              last_water_recover_time: Date.now(),
              fertilize_count: 0,
              last_login_date: '2024-01-01',
              created_at: Date.now(),
            });

            // Create a tree for the user (required for ranking query join)
            treeModel.create(user.id, config.species);

            // Set participation status
            rankingModel.setParticipation(user.id, config.participate ? 1 : 0);

            return { ...config, userId: user.id };
          });

          // Get the ranking
          const ranking = rankingService.getAllRanking();
          const rankedUserIds = ranking.map(r => r.userId);

          // Verify: ranking contains exactly all participating users
          const expectedParticipants = createdUsers
            .filter(u => u.participate)
            .map(u => u.userId);

          const expectedNonParticipants = createdUsers
            .filter(u => !u.participate)
            .map(u => u.userId);

          // All participating users should be in the ranking
          for (const userId of expectedParticipants) {
            expect(rankedUserIds).toContain(userId);
          }

          // No non-participating users should be in the ranking
          for (const userId of expectedNonParticipants) {
            expect(rankedUserIds).not.toContain(userId);
          }

          // The count of our participating users in the ranking should match
          const ourRankedUsers = rankedUserIds.filter(id =>
            createdUsers.some(u => u.userId === id)
          );
          expect(ourRankedUsers.length).toBe(expectedParticipants.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should immediately reflect participation toggle in ranking visibility', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        (numUsers, toggleIndex) => {
          const actualToggleIndex = toggleIndex % numUsers;

          // Create users, all initially participating
          const createdUsers = [];
          for (let i = 0; i < numUsers; i++) {
            const user = userModel.create({
              openid: `toggle-test-${Date.now()}-${Math.random()}-${i}`,
              nickname: `ToggleUser${i}`,
              water_count: 50,
              last_water_recover_time: Date.now(),
              fertilize_count: 0,
              last_login_date: '2024-01-01',
              created_at: Date.now(),
            });

            treeModel.create(user.id, 'apple');
            rankingModel.setParticipation(user.id, 1);
            createdUsers.push(user);
          }

          // Verify all users are in ranking initially
          let ranking = rankingService.getAllRanking();
          let rankedUserIds = ranking.map(r => r.userId);
          for (const user of createdUsers) {
            expect(rankedUserIds).toContain(user.id);
          }

          // Toggle one user to non-participating
          const toggledUser = createdUsers[actualToggleIndex];
          rankingService.toggleParticipation(toggledUser.id, false);

          // Verify immediate visibility change
          ranking = rankingService.getAllRanking();
          rankedUserIds = ranking.map(r => r.userId);

          // Toggled user should NOT be in ranking
          expect(rankedUserIds).not.toContain(toggledUser.id);

          // All other users should still be in ranking
          for (let i = 0; i < numUsers; i++) {
            if (i !== actualToggleIndex) {
              expect(rankedUserIds).toContain(createdUsers[i].id);
            }
          }

          // Toggle back to participating
          rankingService.toggleParticipation(toggledUser.id, true);

          // Verify user is back in ranking
          ranking = rankingService.getAllRanking();
          rankedUserIds = ranking.map(r => r.userId);
          expect(rankedUserIds).toContain(toggledUser.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
