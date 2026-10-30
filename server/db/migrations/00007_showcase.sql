-- Profile showcase: up to 5 cards a player picks to show on their profile.

-- +goose Up
CREATE TABLE showcase_cards (
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position  smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
    -- A card merged away disappears from the showcase with it. Reads also require the
    -- player to still own the card (a traded card stops showing).
    card_id   uuid NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, position)
);

-- +goose Down
DROP TABLE showcase_cards;
