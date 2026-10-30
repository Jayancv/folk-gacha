-- name: LockOwnedCards :many
-- The player's cards among @ids, row-locked for the merge. Locked in id order
-- so two merges of the same cards can't deadlock. Cards another player owns,
-- or that a concurrent merge just used up, are simply missing.
SELECT c.id, c.season_card_id, c.copy_no, c.level, sc.template_id, sc.card_season_id, sc.score
FROM cards c
JOIN season_cards sc ON sc.id = c.season_card_id
WHERE c.id = ANY(@ids::uuid[]) AND c.owner_id = @owner_id
ORDER BY c.id
FOR UPDATE OF c;

-- name: DeleteCards :exec
DELETE FROM cards WHERE id = ANY(@ids::uuid[]);

-- name: GetRecipe :one
-- Inputs in sorted order (game.RecipeKey).
SELECT id, output_template_id FROM merge_recipes WHERE input_a = $1 AND input_b = $2;

-- name: DiscoverRecipe :execrows
-- 1 row = first time this player made the recipe.
INSERT INTO discovered_recipes (user_id, recipe_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListDiscoveredRecipes :many
SELECT r.input_a, r.input_b, r.output_template_id, d.discovered_at
FROM discovered_recipes d
JOIN merge_recipes r ON r.id = d.recipe_id
WHERE d.user_id = $1
ORDER BY d.discovered_at, r.id;
