CREATE TABLE `craft_document_links` (
	`id` text PRIMARY KEY NOT NULL,
	`boardID` text NOT NULL,
	`connectionOwnerID` text NOT NULL,
	`documentID` text NOT NULL,
	`title` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connectionOwnerID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `craft_document_links_board_owner_document_unique` ON `craft_document_links` (`boardID`,`connectionOwnerID`,`documentID`);--> statement-breakpoint
CREATE INDEX `craft_document_links_board_created_idx` ON `craft_document_links` (`boardID`,`createdAt`);