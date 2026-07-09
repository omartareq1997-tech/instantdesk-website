-- Message idempotency safeguards for public widget / AI turns.
--
-- Additive migration. It refuses to create unique indexes if historical
-- duplicate logical messages already exist, so operators can inspect and
-- deduplicate intentionally instead of silently deleting transcript data.

alter table messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
declare
  duplicate_assistant_count integer;
  duplicate_user_count integer;
begin
  select count(*) into duplicate_assistant_count
  from (
    select conversation_id, metadata->>'turn_id' as turn_id
    from messages
    where role = 'assistant'
      and metadata ? 'turn_id'
      and nullif(metadata->>'turn_id', '') is not null
    group by conversation_id, metadata->>'turn_id'
    having count(*) > 1
  ) duplicates;

  if duplicate_assistant_count > 0 then
    raise exception
      'Cannot create messages assistant turn_id uniqueness index: % duplicate conversation_id + turn_id group(s) exist. Inspect messages metadata->>turn_id and merge/archive duplicates first.',
      duplicate_assistant_count;
  end if;

  select count(*) into duplicate_user_count
  from (
    select conversation_id, metadata->>'client_message_id' as client_message_id
    from messages
    where role = 'user'
      and metadata ? 'client_message_id'
      and nullif(metadata->>'client_message_id', '') is not null
    group by conversation_id, metadata->>'client_message_id'
    having count(*) > 1
  ) duplicates;

  if duplicate_user_count > 0 then
    raise exception
      'Cannot create messages user client_message_id uniqueness index: % duplicate conversation_id + client_message_id group(s) exist. Inspect messages metadata->>client_message_id and merge/archive duplicates first.',
      duplicate_user_count;
  end if;
end $$;

create unique index if not exists messages_assistant_turn_once_idx
  on messages (conversation_id, (metadata->>'turn_id'))
  where role = 'assistant'
    and metadata ? 'turn_id'
    and nullif(metadata->>'turn_id', '') is not null;

create unique index if not exists messages_user_client_message_once_idx
  on messages (conversation_id, (metadata->>'client_message_id'))
  where role = 'user'
    and metadata ? 'client_message_id'
    and nullif(metadata->>'client_message_id', '') is not null;
