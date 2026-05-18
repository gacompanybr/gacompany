UPDATE auth.users
SET email = 'legitgutin@gmail.com',
    encrypted_password = crypt('Teste240905@', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'teste@gmail.com';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"legitgutin@gmail.com"'),
    updated_at = now()
WHERE provider = 'email'
  AND user_id = (SELECT id FROM auth.users WHERE email = 'legitgutin@gmail.com');