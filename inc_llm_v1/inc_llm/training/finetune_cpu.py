"""CPU LoRA fine-tuning for Incentives INC-LLM-v1 (0.5B model).

This script fine-tunes Qwen2.5-0.5B on the INC-LLM-v1 dataset using
QLoRA with 4-bit quantization. Designed to run on CPU (slow but works).

Expected time: 2-6 hours depending on CPU and dataset size.
For GPU fine-tuning, use the Colab notebook instead.

Usage:
    py inc_llm/training/finetune_cpu.py
"""

import os
import sys
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def check_dependencies():
    try:
        import torch
        import transformers
        import peft
        import datasets
        logger.info("All dependencies found. torch=%s, transformers=%s", torch.__version__, transformers.__version__)
        return True
    except ImportError as e:
        logger.error("Missing dependency: %s", e)
        logger.error("Install with: pip install torch transformers peft datasets accelerate bitsandbytes")
        return False

def load_dataset(path: str):
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            data.append(json.loads(line.strip()))
    logger.info("Loaded %d examples from %s", len(data), path)
    return data

def main():
    if not check_dependencies():
        sys.exit(1)

    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from datasets import Dataset

    base_model = "Qwen/Qwen2.5-0.5B"
    dataset_path = os.path.join(os.path.dirname(__file__), "dataset.jsonl")
    output_dir = os.path.join(os.path.dirname(__file__), "adapters", "incentives-inc-llm-v1")
    os.makedirs(output_dir, exist_ok=True)

    # Load dataset
    raw_data = load_dataset(dataset_path)
    dataset = Dataset.from_list(raw_data)

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Format and tokenize
    def format_and_tokenize(example):
        text = ""
        for msg in example["messages"]:
            role = msg["role"]
            content = msg["content"]
            text += f"<|im_start|>{role}\n{content}<|im_end|>\n"
        tokenized = tokenizer(
            text,
            truncation=True,
            max_length=512,
            padding="max_length",
            return_tensors="pt",
        )
        tokenized["labels"] = tokenized["input_ids"].clone()
        return {k: v.squeeze() for k, v in tokenized.items()}

    tokenized_dataset = dataset.map(format_and_tokenize, remove_columns=dataset.column_names)

    # Load model
    logger.info("Loading model: %s", base_model)
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.float32,
        device_map="cpu",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    # LoRA configuration
    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=3,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        warmup_steps=50,
        logging_steps=10,
        save_steps=200,
        save_total_limit=2,
        fp16=False,
        optim="adamw_torch",
        report_to="none",
        remove_unused_columns=False,
    )

    # Data collator
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
        data_collator=data_collator,
    )

    logger.info("Starting training (this will take a while on CPU)...")
    trainer.train()

    # Save adapter
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    logger.info("Adapter saved to %s", output_dir)
    logger.info("Next: merge adapter into base model and convert to GGUF for Ollama")

if __name__ == "__main__":
    main()
