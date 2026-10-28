import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  type InteractionReplyOptions,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
  MessageFlags,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { config } from "../config/config.js";

export interface PanelButton {
  customId: string;
  label: string;
  emoji?: string;
  style?: ButtonStyle;
}

export interface PanelOptions {
  accentColor?: number;
  content: string;
  fields?: string[];
  thumbnail?: string;
  image?: string;
  buttons?: PanelButton[][];
  footer?: string | true;
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function heading(
  emoji: string,
  title: string,
  subtitle?: string,
): string {
  return subtitle
    ? `## ${emoji} ${title}\n-# ${subtitle}`
    : `## ${emoji} ${title}`;
}

export function footerLine(
  value: string = config.appearance.footerText,
): string {
  return `-# ${value}`;
}

export function field(label: string, value: string): string {
  return `-# ${label}: ${value}`;
}

export function ephemeralReply(content: string): {
  content: string;
  flags: number;
} {
  return { content, flags: MessageFlags.Ephemeral };
}

export function panelReply(
  container: ContainerBuilder,
  ephemeral = true,
): InteractionReplyOptions {
  return {
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

export function buttonRow(
  buttons: PanelButton[],
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buttons.map((button) => {
      const builder = new ButtonBuilder()
        .setCustomId(button.customId)
        .setLabel(button.label)
        .setStyle(button.style ?? ButtonStyle.Secondary);

      if (button.emoji) builder.setEmoji(button.emoji);

      return builder;
    }),
  );
}

export function panel(options: PanelOptions): ContainerBuilder {
  const container = new ContainerBuilder();

  if (options.accentColor !== undefined) {
    container.setAccentColor(options.accentColor);
  }

  container.addTextDisplayComponents(text(options.content));

  if (options.fields && options.fields.length > 0) {
    container.addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

    const fields = text(options.fields.join("\n"));

    if (options.thumbnail) {
      const url = options.thumbnail;

      container.addSectionComponents((section) =>
        section
          .addTextDisplayComponents(fields)
          .setThumbnailAccessory((thumb) => thumb.setURL(url)),
      );
    } else {
      container.addTextDisplayComponents(fields);
    }
  } else if (options.thumbnail) {
    const url = options.thumbnail;

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents(text(""))
        .setThumbnailAccessory((thumb) => thumb.setURL(url)),
    );
  }

  if (options.image) {
    const url = options.image;

    container.addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) => item.setURL(url)),
    );
  }

  for (const row of options.buttons ?? []) {
    container.addActionRowComponents(buttonRow(row));
  }

  if (options.footer !== undefined) {
    const footer = options.footer === true ? footerLine() : options.footer;

    container.addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

    container.addTextDisplayComponents(text(footer));
  }

  return container;
}

export function panelMessage(
  container: ContainerBuilder,
): MessageCreateOptions {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
