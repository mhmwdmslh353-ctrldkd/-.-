const { GatewayIntentBits } = require('discord.js');
const {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputStyle,
  TextInputBuilder,
  ApplicationCommandOptionType
} = require('discord.js');
const { PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const config = require('./config.json');
const express = require("express");
require('dotenv').config();

// Initialize Express server for 24/7 uptime
const app = express();
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/', (_, res) => {
  res.send('<center><h1>Bot 24H ON!</h1></center>');
});

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Connect to MongoDB
mongoose.connect(process.env.DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Define Mongoose schemas and models
const serverSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  staffroom: { type: String, default: "" },
  roles: { type: [String], default: [] },
  staffid: { type: [String], default: [] },
  logChannelId: { type: String, default: "" }
});

const statsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  totalApplications: { type: Number, default: 0 },
  acceptedApplications: { type: Number, default: 0 },
  rejectedApplications: { type: Number, default: 0 },
  blockedUsers: { type: Number, default: 0 }
});

const applicationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  applications: [{
    timestamp: { type: Date, default: Date.now },
    q1: String,
    q2: String,
    q3: String,
    q4: String,
    q5: String
  }],
  lastApplicationTime: { type: Date, default: Date.now },
  lastStatus: { type: String, default: null }
});

const blocklistSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true }
});
const tempSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  staffroom: { type: String, default: "" },
  roles: { type: [String], default: [] },
  staffid: { type: [String], default: [] },
  logChannelId: { type: String, default: "" }
});
const ServerSettings = mongoose.model('ServerSettings', serverSettingsSchema);
const Stats = mongoose.model('Stats', statsSchema);
const Application = mongoose.model('Application', applicationSchema);
const Blocklist = mongoose.model('Blocklist', blocklistSchema);
const TempSettings = mongoose.model('TempSettings', tempSettingsSchema);

// Log system utility
const logSystem = {
  sendLog: async (guild, content, color = '#0099ff') => {
    try {
      const serverSettings = await ServerSettings.findOne({ guildId: guild.id });
      if (!serverSettings || !serverSettings.logChannelId) return;
      
      const logChannel = guild.channels.cache.get(serverSettings.logChannelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setDescription(content)
        .setColor(color)
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error sending log:', error);
    }
  }
};

// Permission checker utility
const hasPermission = async (member) => {
  try {
    const serverSettings = await ServerSettings.findOne({ guildId: member.guild.id });
    
    // If no settings or roles, only allow administrators
    if (!serverSettings || !serverSettings.roles || serverSettings.roles.length === 0) {
      return member.permissions.has(PermissionsBitField.Flags.Administrator);
    }

    return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.roles.cache.some(role => serverSettings.roles.includes(role.id));
  } catch (error) {
    console.error('Error checking permissions:', error);
    // Fallback to admin only
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }
};

// Helper to check if user is blocked
const isUserBlocked = async (guildId, userId) => {
  const blockedUser = await Blocklist.findOne({ guildId, userId });
  return !!blockedUser;
};

// Stats utility functions
const updateStats = async (guildId, field, increment = 1) => {
  await Stats.findOneAndUpdate(
    { guildId },
    { $inc: { [field]: increment } },
    { upsert: true, new: true }
  );
};

// Bot ready event
client.on('ready', async () => {
  const { REST, Routes } = require('discord.js');
  const commands = [
    {
      name: 'setup',
      description: 'إعداد نظام التقديم',
    },
    {
      name: "block",
      description: "حظر مستخدم من استخدام نظام التقديم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد حظره",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "remove-block",
      description: "إزالة الحظر عن مستخدم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد إزالة الحظر عنه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "stats",
      description: "عرض إحصائيات التقديمات",
    },
    {
      name: "check-user",
      description: "التحقق من معلومات تقديم مستخدم",
      options: [
        {
          name: "user",
          description: "المستخدم المراد التحقق منه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
    {
      name: "clear-cooldown",
      description: "إزالة وقت الانتظار عن مستخدم للتقديم مرة أخرى",
      options: [
        {
          name: "user",
          description: "المستخدم المراد إزالة وقت الانتظار عنه",
          required: true,
          type: ApplicationCommandOptionType.User,
        },
      ],
    },
  ];

  try {
    console.log('بدء تحديث أوامر التطبيق (/)');
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('تم تحديث أوامر التطبيق بنجاح');
    
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}!`);
    
    // Send startup log to all guilds
    for (const guild of client.guilds.cache.values()) {
      logSystem.sendLog(guild, `تم تشغيل البوت بنجاح! ${client.user.tag}`, '#00ff00');
    }
  } catch (error) {
    console.error('Error during startup:', error);
  }
});

// Command handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'block': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const member = interaction.options.getMember('user');
      if (!member) {
        return interaction.reply({ content: 'منشن شخص لـ حظره من الامر', ephemeral: true });
      }

      const isBlocked = await isUserBlocked(interaction.guild.id, member.id);
      if (isBlocked) {
        return interaction.reply({ content: 'هذا الشخص محظور بالفعل!', ephemeral: true });
      }

      const newBlock = new Blocklist({ guildId: interaction.guild.id, userId: member.id });
      await newBlock.save();
      
      await updateStats(interaction.guild.id, 'blockedUsers');

      await interaction.reply({ content: `تم حظر ${member.user.tag} من استخدام نظام التقديم.`, ephemeral: true });
      await logSystem.sendLog(interaction.guild, `تم حظر ${member.user.tag} (${member.id}) من نظام التقديم بواسطة ${interaction.user.tag}`, '#ff0000');
      break;
    }

    case 'remove-block': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const userToRemove = interaction.options.getMember('user');
      if (!userToRemove) {
        return interaction.reply({ content: 'منشن شخص لإزالة الحظر منه', ephemeral: true });
      }

      const removed = await Blocklist.findOneAndDelete({ 
        guildId: interaction.guild.id, 
        userId: userToRemove.id 
      });

      if (removed) {
        await interaction.reply({ content: `تم إزالة الحظر عن ${userToRemove.user.tag} بنجاح.`, ephemeral: true });
        await logSystem.sendLog(interaction.guild, `تم إزالة الحظر عن ${userToRemove.user.tag} (${userToRemove.id}) بواسطة ${interaction.user.tag}`, '#00ff00');
      } else {
        await interaction.reply({ content: `${userToRemove.user.tag} ليس محظورًا.`, ephemeral: true });
      }
      break;
    }

    case 'stats': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      let stats = await Stats.findOne({ guildId: interaction.guild.id }) || { 
        totalApplications: 0, 
        acceptedApplications: 0, 
        rejectedApplications: 0, 
        blockedUsers: 0 
      };

      const blockedCount = await Blocklist.countDocuments({ guildId: interaction.guild.id });

      const statsEmbed = new EmbedBuilder()
        .setTitle('📊 إحصائيات نظام التقديم')
        .setColor(config.embedcolor)
        .addFields(
          { name: 'إجمالي التقديمات', value: `${stats.totalApplications || 0}`, inline: true },
          { name: 'التقديمات المقبولة', value: `${stats.acceptedApplications || 0}`, inline: true },
          { name: 'التقديمات المرفوضة', value: `${stats.rejectedApplications || 0}`, inline: true },
          { name: 'المستخدمين المحظورين', value: `${blockedCount || 0}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
      break;
    }

    case 'check-user': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const user = interaction.options.getUser('user');
      if (!user) {
        return interaction.reply({ content: 'يرجى تحديد مستخدم للتحقق من معلوماته', ephemeral: true });
      }

      const userInfo = await Application.findOne({ userId: user.id });
      const isBlocked = await isUserBlocked(interaction.guild.id, user.id);

      const infoEmbed = new EmbedBuilder()
        .setTitle(`معلومات المستخدم: ${user.tag}`)
        .setColor(config.embedcolor)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'الحالة', value: isBlocked ? '🚫 محظور من التقديم' : '✅ غير محظور', inline: true }
        )
        .setTimestamp();

      if (userInfo) {
        infoEmbed.addFields(
          { name: 'عدد التقديمات', value: `${userInfo.applications.length}`, inline: true },
          { name: 'آخر تقديم', value: `<t:${Math.floor(userInfo.lastApplicationTime.getTime() / 1000)}:R>`, inline: true },
          { name: 'الحالة الأخيرة', value: userInfo.lastStatus || 'غير معروفة', inline: true }
        );
      } else {
        infoEmbed.addFields(
          { name: 'التقديمات', value: 'لم يقم بالتقديم من قبل', inline: true }
        );
      }

      await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      break;
    }

    case 'clear-cooldown': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({ content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true });
      }

      const user = interaction.options.getUser('user');
      if (!user) {
        return interaction.reply({ content: 'يرجى تحديد مستخدم لإزالة وقت الانتظار عنه', ephemeral: true });
      }

      const result = await Application.findOneAndUpdate(
        { userId: user.id },
        { $set: { lastApplicationTime: new Date(0) } },
        { new: true }
      );

      if (result) {
        await interaction.reply({ content: `تم إزالة وقت الانتظار عن ${user.tag} بنجاح. يمكنه التقديم مرة أخرى الآن.`, ephemeral: true });
        await logSystem.sendLog(interaction.guild, `تم إزالة وقت الانتظار عن ${user.tag} (${user.id}) بواسطة ${interaction.user.tag}`, '#00ffff');
      } else {
        await interaction.reply({ content: `${user.tag} لم يقم بالتقديم من قبل.`, ephemeral: true });
      }
      break;
    }

    case 'setup': {
      if (!await hasPermission(interaction.member)) {
        return interaction.reply({content: "لا يمكنك استخدام هذا الأمر لأنك ليس لديك الصلاحيات أو الرتب المطلوبة.", ephemeral: true});
      }
      
      const setupRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('setup_channel_select')
            .setLabel('تحديد روم الإدارة')
            .setStyle(ButtonStyle.Primary)
        );
      
      await interaction.reply({
        content: 'مرحبًا بك في إعداد نظام التقديم. يرجى النقر على الزر أدناه لبدء عملية الإعداد.',
        components: [setupRow],
        ephemeral: true
      });
      break;
    }
  }
});

// Setup process handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId === 'setup_channel_select') {
      const modal = new ModalBuilder()
        .setCustomId('setup_admin_channel_modal')
        .setTitle('تحديد روم الإدارة');
      
      const channelInput = new TextInputBuilder()
        .setCustomId('admin_channel_id')
        .setLabel('أدخل معرف روم الإدارة (ID)')
        .setPlaceholder('مثال: 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_admin_roles') {

      const modal = new ModalBuilder()
        .setCustomId('setup_admin_roles_modal')
        .setTitle('تحديد الرتب الإدارية');
      
      const rolesInput = new TextInputBuilder()
        .setCustomId('admin_roles_ids')
        .setLabel('أدخل معرفات الرتب مفصولة بفواصل')
        .setPlaceholder('مثال: 123456789,987654321')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_staff_roles') {

      const modal = new ModalBuilder()
        .setCustomId('setup_staff_roles_modal')
        .setTitle('تحديد رتب المقبولين');
      
      const rolesInput = new TextInputBuilder()
        .setCustomId('staff_roles_ids')
        .setLabel('أدخل معرفات الرتب مفصولة بفواصل')
        .setPlaceholder('مثال: 123456789,987654321')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'setup_next_log_channel') {

      const modal = new ModalBuilder()
        .setCustomId('setup_log_channel_modal')
        .setTitle('تحديد روم اللوق');
      
      const channelInput = new TextInputBuilder()
        .setCustomId('log_channel_id')
        .setLabel('أدخل معرف روم اللوق (ID)')
        .setPlaceholder('مثال: 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'complete_setup') {
      try {
        // Retrieve temporary settings from MongoDB
        const tempSettings = await TempSettings.findOne({ guildId: interaction.guild.id });

        
        if (!tempSettings) {
          return interaction.update({
            content: 'لم يتم العثور على إعدادات مؤقتة. يرجى إعادة بدء عملية الإعداد.',
            components: []
          });
        }
        
        // Save to permanent settings
        await ServerSettings.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            staffroom: tempSettings.staffroom,
            roles: tempSettings.roles,
            staffid: tempSettings.staffid,
            logChannelId: tempSettings.logChannelId
          },
          { upsert: true }
        );
        
        // Create application button
        const embed = new EmbedBuilder()
          .setTitle(config.title)
          .setDescription('أضـغـط فـي الاسـفـل للتقـديـم')
          .setColor(config.embedcolor);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Success)
              .setLabel(config.title)
              .setCustomId('apply')
          );
        
        await interaction.channel.send({
          embeds: [embed],
          components: [row]
        });
        
        await interaction.update({
          content: 'تم إعداد نظام التقديم بنجاح! تم حفظ جميع الإعدادات وإنشاء زر التقديم.',
          components: []
        });
        
        // Send log
        const logChannel = interaction.guild.channels.cache.get(tempSettings.logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setDescription(`تم إعداد نظام التقديم في القناة ${interaction.channel} بواسطة ${interaction.user.tag}`)
            .setColor('#00ff00')
            .setTimestamp();
          
          await logChannel.send({ embeds: [logEmbed] });
        }
        
        await TempSettings.deleteOne({ guildId: interaction.guild.id });
      } catch (error) {
        console.error('Error completing setup:', error);
        await interaction.update({
          content: 'حدث خطأ أثناء إكمال الإعداد. يرجى المحاولة مرة أخرى.',
          components: []
        });
      }
    }
    if (interaction.customId === 'apply') {

      const isBlocked = await isUserBlocked(interaction.guild.id, interaction.user.id);
      if (isBlocked) {
        await interaction.reply({ content: 'أنت محظور من التقديم ولا يمكنك التقديم أبدًا.', ephemeral: true });
        return;
      }

      const userInfo = await Application.findOne({ userId: interaction.user.id }) || 
        { applications: [], lastApplicationTime: new Date(0), lastStatus: null };
      
      const cooldownTime = ms(config.applicationCooldown) || 86400000;
      const timeRemaining = new Date(userInfo.lastApplicationTime).getTime() + cooldownTime - Date.now();

      if (timeRemaining > 0) {
        const hours = Math.floor(timeRemaining / 3600000);
        const minutes = Math.floor((timeRemaining % 3600000) / 60000);
        await interaction.reply({
          content: `لا يمكنك التقديم الآن. يجب الانتظار ${hours} ساعة و ${minutes} دقيقة قبل التقديم مرة أخرى.`,
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setTitle('التـقديـم لللأدارة')
        .setCustomId('staff_apply');

      const nameComponent = new TextInputBuilder()
        .setCustomId('q1')
        .s
