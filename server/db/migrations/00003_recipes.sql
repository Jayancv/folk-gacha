-- Merge recipes (two different spirits make a new one) and each player's recipe book.
-- Recipes are seeded from seed/recipes.json by cmd/seed.

-- +goose Up
CREATE TABLE merge_recipes (
    id                  serial PRIMARY KEY,
    -- Inputs in sorted order, so (a, b) and (b, a) are the same recipe.
    input_a             text NOT NULL REFERENCES card_templates(id),
    input_b             text NOT NULL REFERENCES card_templates(id),
    output_template_id  text NOT NULL REFERENCES card_templates(id),
    UNIQUE (input_a, input_b),
    -- Two of the same spirit is a level-up, never a recipe.
    CHECK (input_a < input_b)
);

-- Recipes are hidden until a player makes them once.
CREATE TABLE discovered_recipes (
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id      integer NOT NULL REFERENCES merge_recipes(id),
    discovered_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, recipe_id)
);

-- +goose Down
DROP TABLE discovered_recipes;
DROP TABLE merge_recipes;
