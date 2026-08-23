import * as Joi from 'joi';

export default Joi.object({
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string().required(),
  JWT_SECRET: Joi.string().default('your-secret-key'),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
});
