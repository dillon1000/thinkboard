CREATE TABLE `boardInvitation` (
	`id` text PRIMARY KEY NOT NULL,
	`boardID` text NOT NULL,
	`inviterID` text NOT NULL,
	`tokenHash` text NOT NULL,
	`targetEmail` text,
	`role` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviterID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boardInvitation_tokenHash_unique` ON `boardInvitation` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `boardInvitation_boardID_createdAt_idx` ON `boardInvitation` (`boardID`,`createdAt`);--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerID` text NOT NULL,
	`title` text NOT NULL,
	`color` text NOT NULL,
	`examDate` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`ownerID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_ownerID_updatedAt_idx` ON `course` (`ownerID`,`updatedAt`);--> statement-breakpoint
ALTER TABLE `board` ADD `courseID` text REFERENCES course(id) ON DELETE set null;
