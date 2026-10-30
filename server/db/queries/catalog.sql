-- name: ListTemplateIDs :many
SELECT id FROM card_templates ORDER BY id;

-- name: CountSeasonCards :one
SELECT count(*) FROM season_cards WHERE card_season_id = $1;

-- name: UpsertRecipe :exec
-- Re-seeding may change a recipe's output (tuning before launch); its id, and so
-- every player's discovery of it, stays the same.
INSERT INTO merge_recipes (input_a, input_b, output_template_id)
VALUES ($1, $2, $3)
ON CONFLICT (input_a, input_b) DO UPDATE SET output_template_id = EXCLUDED.output_template_id;

-- name: ListRecipes :many
SELECT * FROM merge_recipes ORDER BY input_a, input_b;
